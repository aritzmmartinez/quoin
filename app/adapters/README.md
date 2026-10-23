# adapters — the edge

Everything that touches the outside world. Implements the `ports` defined in `core`.

Rule (enforced by lint):
- `adapters` may import from `core`, NOT from `app`.
- Swapping broker / price provider / country = a new adapter, `core` untouched.

Contents:
- `ingestion/`   `TradeRepublicCsvAdapter` + `KrakenCsvAdapter` (CSV -> ledger events; sets aside card spending and crypto swaps; dedup by transaction id), plus `holdings/`: one issuer-agnostic parser for fund compositions. A crypto instrument's id is its asset code (`BTC`, `ETH`…) in every adapter, through `cryptoInstrumentId`, so one asset is one FIFO queue whichever broker holds it (Art. 47.2 NF 13/2013)
- `persistence/` Prisma 7 + SQLite (schema, generated client, repositories for ledger, instruments, prices, holdings, identities, inflation levels and the savings plan)
- `marketdata/`  `YahooMarketDataProvider` behind the `MarketDataProvider` port; per-instrument `quoteSymbol` mapping (kept in the local DB, not the repo)
- `identity/`    `OpenFigiIdentityResolver` behind the `SecurityIdentityResolver` port; maps an ISIN or a venue-qualified ticker to a share-class FIGI so the same company stops being two leaves
- `inflation/`   `ine/`, the monthly consumer price index from INE's Tempus3 API (national and Bizkaia); the fetch is one file and `parseIneSeries` is another, pure and tested without a network. The levels land through `InflationRepository`, implemented in `persistence/`
- `fx/`          (planned) exchange rates for non-EUR quotes (e.g. ECB / `EURUSD=X`)
- `http/`        `withTimeout`, the one bound every provider request goes through

## ingestion/kraken — what the adapter guarantees

- **The export's schema is required, not sniffed.** `txid`, `refid`, `time`, `type`,
  `aclass`, `subclass`, `asset`, `wallet`, `amount`, `fee` and `balance` must be present;
  `subtype`, `amountusd`, `feeusd`, `balanceusd` and `feecurrency` may be empty. An export
  with no `wallet` column is the old format and is refused as `KrakenLegacyExportError`
  before anything is read from it.
- **The file is reconciled before anything is written.** Per `(asset, wallet)`, each row's
  `balance` must equal the previous balance plus `amount − fee`. The first row of a pair
  has nothing before it and sets the starting point. One mismatch refuses the whole file
  (`KrakenBalanceMismatchError`, naming asset, wallet and time): a gap or a reordered row
  would otherwise become a quantity nobody can explain.
- **A row's quantity is `amount − fee`.** Fiat is recognised by `subclass`, never by a list
  of currency codes. A buy or sell is a `spend`/`receive` pair against fiat of any asset;
  its price is the fiat paid or received over that net quantity.
- **`valuationSource` says where a row's value came from** (`kraken-amountusd` or `yahoo`).
  It has no database CHECK and is validated by Zod at write, so a new source is a code
  change and not a migration. The symbol check compares against a reward only when it was
  valued by `kraken-amountusd`: a value read from a price history proves nothing about that
  history.
- **A reward is valued at Kraken's own figure when it has one.** `amountusd − feeusd` over
  the net quantity, in USD (booked in euros at the ECB rate of its day). Only without
  `amountusd` does it fall back to the price history, and without that it is set aside as
  `reward-unpriced`, never valued at zero. Only `type: reward` and `earn` with
  `subtype: reward` are rewards; any other `earn` subtype is `unsupported`.
- **Internal moves produce no events.** A `transfer` that is not `useraccounttransfer`, and
  an `earn` allocation, deallocation, autoallocation or migration, move units between the
  user's own wallets. A group made only of those is set aside as `internal-move`, which does
  not affect a position. If an earlier import had booked one as a reward, the new import
  says so (`internal-booked-as-reward`) and changes nothing already stored.
- **`useraccounttransfer` is cash.** A fiat transfer with another account is stored as a
  `DEPOSIT` or `WITHDRAWAL` and carries a notice (`account-transfer`), since it may or may
  not be the user's own money. Crypto transfers in or out stay `crypto-transfer`.
- **Swaps are still set aside.** A `spend`/`receive` pair where neither side is fiat is
  `crypto-swap` and flagged as affecting the position until swaps are modelled.
- **An instrument already stored keeps its name.** An import never renames it; a new one
  takes its asset code, with a short name for the few that have one.
- **Symbol suggestion is `<CODE>-EUR`, plus a table of verified exceptions** (`app/lib/ingest.ts`).
  An entry goes in only after the line was checked by hand, with the date it was measured;
  the symbol check still decides, so a wrong entry cannot be saved unnoticed.

## holdings/ — no per-issuer branch

Six real issuer exports built this and none needed a rule of its own, so a seventh should
need no code. The weight column is found by being **the one that adds up to about 100**,
which survives a different language, layout or number format — and doubles as
verification, since a file where nothing adds up is not a holdings table.

The awkward parts are all pure functions with tests: `numbers.ts` (every way a spreadsheet
writes a number), `detect.ts` (where the header starts, which column is which),
`venue.ts` (folding venue names to ISO codes) and `parse.ts` (weights, residual, folding).
Fixtures are synthetic — the set of funds whose holdings get imported *is* the owner's
portfolio, and this repository is public.

## identity/ — why a canonical id is needed at all

Issuers disagree on what to publish. Three of six give an ISIN, three give a ticker, and
they hold hundreds of the same companies, so the same business counts twice. Both sides
map to a share-class FIGI, which links one share class across countries.

Everything network-facing is in `provider.ts`; the decisions live in pure functions next
to it, so which FIGI level to trust, what an ambiguous ticker means and how to compare two
clipped names are all unit-tested without a network.
