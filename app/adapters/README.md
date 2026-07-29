# adapters — the edge

Everything that touches the outside world. Implements the `ports` defined in `core`.

Rule (enforced by lint):
- `adapters` may import from `core`, NOT from `app`.
- Swapping broker / price provider / country = a new adapter, `core` untouched.

Contents:
- `ingestion/`   `TradeRepublicCsvAdapter` + `KrakenCsvAdapter` (CSV -> ledger events; filters card spending / non-BTC crypto; dedup by transaction id), plus `holdings/`: one issuer-agnostic parser for fund compositions
- `persistence/` Prisma 7 + SQLite (schema, generated client, repositories for ledger, instruments, prices, holdings and identities)
- `marketdata/`  `YahooMarketDataProvider` behind the `MarketDataProvider` port; per-instrument `quoteSymbol` mapping (kept in the local DB, not the repo)
- `identity/`    `OpenFigiIdentityResolver` behind the `SecurityIdentityResolver` port; maps an ISIN or a venue-qualified ticker to a share-class FIGI so the same company stops being two leaves
- `fx/`          (planned) exchange rates for non-EUR quotes (e.g. ECB / `EURUSD=X`)

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
