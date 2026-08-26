# Architecture — Quoin

Personal, self-hosted, local-first investment webapp. Open source.
Zero hosting cost, minimal maintenance, portable across a future relocation.

## Project shape (decision B)

**A single React Router app** (framework mode, SSR) with **folder boundaries**, not a
monorepo. `core` is pure TypeScript with no framework dependency, so extracting it into a
package the day there's a second consumer (CLI, Tauri) is mechanical. Setting up workspaces
now would pay complexity for portability not yet exercised.

## Layers and dependency direction

```
app (routes, components, root)  ->  adapters  ->  core
```

The direction points inward and is **enforced by lint** (`no-restricted-imports` per folder,
no heavy plugins):

- `app/core/**`     pure domain. MUST NOT import from `adapters` or `app`.
- `app/adapters/**` implement core's ports. May use `core`, NOT `app`.
- `app/**` (rest)   may use everything.

Convention: internal imports always use the `~/...` alias.

### core
- `domain/`      value objects (Money as string + decimal.js), ledger event types, exposure leaves, `resolveIntrinsic` / `resolveWithHoldings` / `canonicaliseLeaves`, `InflationIndex` + `Period` / `periodOf` / `deflate` and the `Revalue` function every projection takes to work in real terms, the portfolio target and `getActiveTarget`
- `ports/`       interfaces: `LedgerRepository`, `InstrumentRepository`, `MarketDataProvider`, `PriceRepository`, `HoldingsRepository`, `SecurityIdentityResolver`, `SecurityIdentityRepository`, `InflationRepository`, `TargetRepository` (planned: `FxProvider`)
- `projections/` pure functions: `walkAvco` and the two views over it (`computePositions`, `computeRealizedGains`), `computeTradeMeta`, `computeMarketValues`, `computeCostBasisTimeline`, `computeInvestedVsValueSeries`, `computePortfolioSummary` / `computeAllocation` / `computeTopPositions`, `computeReturns` and `computePortfolioReturns` over the shared `xirr` solver, `computeExposures` (look-through), `computeCurrencyExposure`, `computeFundOverlap` / `computeAllFundOverlaps`, `realBasis`, `deriveTargetWeights`, `computeRebalance`, `computeProjection` / `projectionWindow` / `solveContribution` / `solveHorizon`
- `tax/`         the Bizkaia *foral* capital-gains projection, separate from `projections/` because it answers a different question about the same ledger: `walkFifo` (the shared FIFO fold), `computeTaxLots` (one fiscal year), `findWashSaleTrigger`, `computeNetWithCarryforward`, and `config.ts` (`TAX_SCALES`, `WASH_SALE_WINDOW_MONTHS`, `LOSS_CARRYFORWARD_YEARS`). `Territory` is `"bizkaia"` only — Spanish IRPF, not a multi-country abstraction.

### adapters
- `ingestion/`   `TradeRepublicCsvAdapter` + `KrakenCsvAdapter` (CSV -> events; filter card spending / non-BTC crypto; dedup by transaction id) and `holdings/`, one issuer-agnostic parser for fund compositions
- `persistence/` Prisma 7 + SQLite (schema, generated client, ledger/instrument/price/holdings/identity repositories)
- `marketdata/`  `YahooMarketDataProvider` behind the `MarketDataProvider` port; `quoteSymbol` per instrument (local DB only)
- `identity/`    `OpenFigiIdentityResolver` behind the `SecurityIdentityResolver` port; maps an ISIN or a ticker to a share-class FIGI
- `inflation/`   `ine/`, the consumer price index from INE's Tempus3 API (national and Bizkaia), parsed pure and separately from the fetch that feeds it
- `fx/`          (planned) exchange rates for non-EUR quotes

#### The holdings parser has no per-issuer branch

Six real issuer exports were used to build it and none of them needed a rule of its
own. The trick is that the **weight column is the one whose values add up to about
100**, a signal that survives translation, reformatting and rebranding — and that
doubles as verification, since a file where nothing adds up is not a holdings table and
saying so beats importing half of one. The identity column is picked by ISIN shape and
then by being mostly unique, which is what stops a `Region` column of `US` and `JP` from
passing as tickers.

A ticker alone is not an identity: in one global fund `SAN` was Banco Santander in
Madrid and Sanofi in Paris, `MRK` was Merck & Co and Merck KGaA, and `6526` was
Socionext and Airoha — ninety collisions in one file. Identities therefore carry their
venue (`SAN.ES`), folded to ISO country codes so two issuers spelling it `US` and
`United States` agree. Same principle as a quote symbol being `IBE.MC` and not `IBE`.

#### Canonical identity closes the gap between issuers

Venue qualification is not enough, because issuers disagree on *what* to publish: some
give an ISIN, others only a ticker, and they share hundreds of companies. Both are
mapped to a **share-class FIGI**, the level that links one share class across countries.
Composite FIGI would only link venues within a country and leave the gap open; the
instrument-level FIGI is per listing and would leave every venue separate.

Tickers are sent without an exchange code, because OpenFIGI speaks Bloomberg's exchange
vocabulary rather than ISO. Every listing comes back and only unanimity resolves; when
candidates disagree, the venue decides first (structured data) and the issuer's own name
second. If neither decides, the resolution is refused — a leaf keeps its raw identity and
still reports the right value, it just does not merge. A wrong merge would silently claim
a holding that does not exist, which is worse than not merging.

Resolution happens at import time and is cached permanently, misses included; no screen
ever touches the network. Lookups run in descending weight order, which is what makes an
unauthenticated run usable: the endpoint allows ten per request and twenty-five requests
a minute, so five thousand constituents would take twenty minutes — but nearly all of
them sit in the long tail, and a budget of a couple of hundred already covers every row
a person can see.

## Projections that needed a decision

Eight of them, written down here because the reasoning is not visible in the code and was
otherwise only in a commit message.

#### One AVCO walk, two projections

`computePositions` (what is held now) and `computeRealizedGains` (what each sale produced)
are two views over the same fold, `walkAvco`. They started as separate implementations of
the same arithmetic, which is how the portfolio total and the per-sale breakdown begin to
disagree; a test now asserts the sum of the sales matches the portfolio's realised total to
the cent. **AVCO is the portfolio view only.** FIFO exists for the foral return and is a
deliberately separate projection — the same sale has two correct answers depending on which
question is being asked, and merging them would lose that. (The FIFO half is its own
subsection below.)

#### Real returns deflate flow by flow, never the total

Every contribution entered with a different purchasing power, so each one is restated **at
its own month inside the AVCO fold** and only then averaged. Deflating the finished total
would apply one month's index to money that arrived across years, and it would flatter the
result. The seam is one optional `Revalue` argument threaded through `walkAvco`,
`computeCostBasisTimeline` and `computeInvestedVsValueSeries`, so a projection is nominal
or real by what it is handed, not by a second implementation.

The month of a trade is Madrid's, never UTC's, and the reference month is the last one INE
has **published**, which lags by a few weeks. Both lines of the evolution chart are
restated — invested at each contribution's date, value at each price mark's — because
restating one and not the other turns plain inflation into a gap between them. A month with
no published level is reported and disables real mode; it is never interpolated.

#### The savings plan stores euros and derives weights

A plan is written in euros per month ("300 into FTSE"), so euros are the fact and
`deriveTargetWeights` is a view of them. Storing both invites the day they disagree — the
same mistake as storing a leaf total beside its contributions. Versions are resolved by
`activeFrom`, never by `createdAt`, and a version is never edited: changing the plan records
the next one, so "what was I aiming at in March" stays answerable. A line may name an
instrument never bought, which is why `PortfolioTargetLine.instrumentId` carries no foreign
key.

#### XIRR refuses rather than guesses

One shared solver (`projections/xirr.ts`): Newton-Raphson, with bisection behind it because
Newton alone wanders off on irregular flows and returns a confident number nobody can
defend. It returns `null` — never a stand-in — for fewer than two flows, for flows that all
carry the same sign (the rate is undefined), and for non-convergence; the UI states the
absence. Portfolio TWR is **not** an average of the per-instrument figures: it links the
sub-period returns between value points with each period's flow removed. Both figures stay
nominal even under the real basis, because the flows are the euros that actually left the
bank. A compounded return is unauditable as a scalar, so `explainPortfolioTwr` exposes the
chain link by link and `pnpm twr:explain` ranks it.

#### The projection simulates two pots, and refuses when the window is thin

Where the plan could end up is a bootstrap: months are drawn with replacement from the
window every planned line shares, and the result is reported as p10/p50/p90 because a
single line would pretend to know the future. Two decisions carry it.

**Money the plan names and money it does not are separate pots.** The planned one receives
the contributions at target weights; everything else held compounds at its own weights and
is never funded, because lending the plan's return distribution to a position the plan does
not mention is the same error as pro-rating an `UNRESOLVED` leaf. Both pots advance on the
**same drawn month index** — drawing separately would treat the two halves of the portfolio
as independent and understate a bad month. A held position that does not cover the whole
window is reported with its value and left out; adding it flat at 0% would be as false a
claim as lending it the plan's returns, and letting it shorten the window would let last
month's purchase shrink the sample everything rests on.

**Below sixty shared months the screen prints no number at all.** Resampling one market
regime and compounding it for decades extrapolates that regime, and a caveat under a large
figure stops being read — the same rule that has a CPI hole disable real mode outright.
`projectionWindow` is separate from the simulation precisely so the refusal can name the
limiting instrument without simulating anything.

The loop is the one place floats are allowed: it reports a guess, and a Monte Carlo median
quoted to the cent claims a precision the method does not have. `Money` still guards the
boundaries. How many paths to draw is **measured, not chosen** — `pnpm projection:converge`
reports how far each percentile moves between seeds at several simulation counts, as a
standard deviation rather than a range (a range grows with the seed count and makes two
runs incomparable) and fitted over the whole grid rather than its end rows. The tail is
about four times noisier than the median at any count, because it is estimated from far
fewer of the drawn paths; it converges at the same `1/√N` all the same, and the screen says
so rather than implying more history would settle it.

#### Currency exposure: the country comes from outside, OpenFIGI only confirms it

Which currencies the portfolio does business in is a question about the securities held,
not about where each trade settled — buying NVIDIA on Xetra in euros is dollar exposure.
The provider does not answer it directly: OpenFIGI's `/mapping` response carries no
`currency` field (`currency` is a request filter only), and it publishes no primary-listing
flag — every large cap is composite-listed in a dozen countries, so a first version that
refused on "more than one country" refused 99% of an already-resolved set.

So the country is **supplied from outside and OpenFIGI only confirms it**, in three
branches, in order: (1) the venue the issuer published in the holdings file (`NVDA.US`) —
a fact, no provider, and four fifths of holdings are venue-qualified; (2) a bare ISIN
proposes its registered country, taken **only if** a row of that share class actually
carries that country's code — the prefix never decides alone, which is what keeps Accenture
(`IE...`, no Irish listing) from being reported as EUR; (3) anything else is unresolved and
reported at full value in its own bucket, never pro-rated. `SecurityIdentity.exchCode`
stores the confirmed code and the currency is **derived at read** through a Bloomberg→ISO
table (`bloombergCurrency`), so a wrong entry is a one-line fix, not a re-resolution of
thousands of identities. That table is held to a higher bar than the ISO→Bloomberg one it
looks like the inverse of: a wrong entry there is a wrong currency on screen with nothing
to catch it, where the other only narrows an already-ambiguous set.

The fold is over **contributions, never over leaves**: one company held directly and
through a hedged fund is one leaf and two different currency exposures, so folding at the
leaf would have to pick one. Hedging is a property of the vehicle and is in no market data
— `Instrument.hedgedToBase` is set by hand and excluded from `InstrumentWriteData`, like
`ter`. There is no FX and none is needed: every amount is already EUR by the valuation
invariant, so this labels and sums, it never converts.

#### Fund overlap: `Σ min(weight)`, and the residual never crosses

How much of two funds is the same company is the industry measure,
`Σ min(weight_A, weight_B)` over the companies both hold. The weight is the holding's
weight **inside its own fund** (the composition that sums to ~1), never its weight in the
portfolio — overlap is a property of the two funds, and how much is invested in each does
not change how alike they are. There is no division anywhere, so an empty intersection is
an exact `0`, never `NaN`.

A fund with no composition imported is left out and counted in the header, never given a
false 0%, and an `UNRESOLVED` leaf (a fund's own undecomposed residual) never crosses:
pro-rating it would invent a shared bet that is not there. A fund's cash buffer is
dropped from the **listed contributors** — two funds holding yen is a settlement artefact,
not a shared position — but kept in the **overlap figure itself**, which stays
arithmetically the sum of the minimums. The screen is scoped to open positions: a closed
fund is not part of today's concentration.

#### The foral return is FIFO, and it is a separate projection

The Bizkaia foral return pairs a disposal with the **oldest lots first**, where the
portfolio view uses AVCO. `walkFifo` is the counterpart to `walkAvco` — one fold, per
`(instrument, sleeve)` queue, that both `computeTaxLots` (one fiscal year) and
`computeNetWithCarryforward` (the target year and the four before it) are views over. The
fiscal year is Madrid's calendar, the same timezone rule as `periodOf`. Nothing FIFO is
persisted: every figure is recomputed from the ledger on read, so it can never drift from
the events, and the AVCO realised view is untouched beside it.

Two rules carry the domain. **The wash-sale exclusion is a deliberate simplification.**
Art. 43 NF 13/2013 *defers* a loss on securities repurchased within two months until the
repurchased position is finally sold; Quoin does not model the deferral — it *excludes*
the loss from that year's deductible net and **flags it on screen**, so whoever files the
return sees it rather than having it silently moved. The trades that make up the sold lot
are excluded from the repurchase search, or almost every quick loss would trip the rule on
its own acquisition. **Carryforward is recomputed, not tracked.** `computeNetWithCarryforward`
walks `targetYear − 4 .. targetYear` from scratch, consuming pending losses oldest-first;
restricting the window to four years is what enforces expiry without storing a countdown.

**The bracket scale is keyed by year.** `TAX_SCALES` holds the savings-base brackets per
`(territory, year)` with the norm that set them as a `source` string; `getTaxScale` returns
`null` for a year not on file and the screen states the absence rather than applying a
stale scale. Same rule as the plan storing euros and deriving the weight: a rate is data,
and a superseded scale is a wrong number that looks right.

Never cite an NF 13/2013 article number that has not been checked against the actual text.
Two were fabricated during development (`Art. 47.2`, `Art. 71` — both plausible, both
wrong; the real ones are Art. 43 and Art. 66). A guessed-but-plausible citation invites a
trust nobody earned.

## Persistence (Prisma 7 + SQLite)

- **Prisma 7** uses a query compiler and **requires a driver adapter**: SQLite uses
  `@prisma/adapter-better-sqlite3` + `better-sqlite3` (native module; compiled on install).
- ESM `prisma-client` generator with `output` inside the persistence layer
  (`app/adapters/persistence/generated/`, gitignored). The client lives where it can be used,
  and the lint boundary keeps `core` from importing it.
- The connection URL lives in **`prisma.config.ts`** (Prisma 7), not in the datasource block.
- **Models**: `Instrument` (master, key = ISIN or symbol; `quoteSymbol` for price lookups and
  `exposureKind`/`exposureLeafId` for look-through, `ter` for the annual fee — all four set by
  CLI or the instruments screen, never by ingestion, and omitted from `InstrumentWriteData` at
  the type level so a re-import cannot clobber them), `LedgerEntry` (immutable ledger), `PriceSnapshot`
  (append-only price history, `@@unique([instrumentId, asOf])`), `EtfHolding` (a fund's
  published composition), `InflationIndex` (monthly CPI levels), `PortfolioTarget` +
  `PortfolioTargetLine` (the savings plan, one version per `activeFrom`, one line per
  instrument per version) and `SecurityIdentity` (the identity cache). Every
  amount/quantity/price/weight is a `String` (decimal) -> operated on with decimal.js.
  `@@unique([source, externalId])` makes ingestion idempotent.
- **`InflationIndex` rows carry their `base`, unlike `PriceSnapshot`.** A past price is a
  fact that never changes; a past index level is republished against a new reference year
  every few years. Append-only alone would keep the old levels beside the new ones and every
  ratio spanning the boundary would be wrong, in the flattering direction — so `ipc:sync`
  refuses on a base change until told to rebase the series wholesale.
- `EtfHolding` is **replace-only, not append-only** like price history: a holdings file is a
  snapshot of what a fund holds today, not an event that happened, so appending would keep
  constituents that have left the index. The residual — cash, derivatives and rounding — is
  derived at read time and never stored beside the weights, because storing both invites the
  day they disagree.
- Repositories implement core's ports (`LedgerRepository`, `InstrumentRepository`,
  `PriceRepository`); the loader reads snapshots persisted by `prices:sync` and never hits the
  network in a request.

### Database setup

```bash
cp .env.example .env    # DATABASE_URL -> data/quoin.sqlite
pnpm install            # builds better-sqlite3 + generates the client (postinstall)
pnpm run db:migrate     # creates the database and the first migration
pnpm run db:studio      # (optional) GUI to inspect the data
```

## Non-negotiable principles

- **Ledger as the source of truth.** Immutable transactions; everything else is derived.
  Pragmatic implementation (ledger + derived queries), no CQRS.
- **Money as a string + decimal.js.** Never `number`. Never the ORM's Decimal on SQLite.
- **ISIN as the instrument key** (an identifier; crypto uses its symbol).
- **Fragile integrations behind a port**, with manual/CSV import as the always-works fallback.
- **What cannot be broken down is reported, never spread.** An undecomposed fund becomes an
  `UNRESOLVED` leaf carrying its own value; pro-rating it across the leaves we do know would
  invent a concentration. The same rule applies inside a fund: one published with only its top
  ten resolves to eleven leaves, ten companies and a large unknown.
- **Contributed is what left the bank, fees included** — one definition, shared by the cost
  basis, the invested timeline and the XIRR cash flows. The foral rule puts inherent costs
  inside the acquisition value, and excluding them flatters returns. TWR is the exception on
  purpose: it works from price marks, and a fee is not a price. TWR is how the **asset** did,
  MWR how **my money** did; under monthly contributions they diverge, and that is the point.
- **Derived figures are never stored beside their inputs.** A leaf total, a target weight, a
  base year: each is computed on read. Storing both invites the day they disagree, which is
  exactly how the fee bug happened.
- **Contributions are kept, not summed.** "NVIDIA 11.2%" is not actionable; "9.7% held
  directly, 1.5% inside the index funds" is, because only the first part is a decision.

## Data and secrets (public repo)

The code is public; data and credentials, NEVER. `data/`, `*.sqlite`, `*.csv`, `.env` and
`credentials*` are gitignored. `.env.example` documents the variables without values.
Quote symbols (which reveal holdings) live only in the local DB, never in the repo.

## Stack

React Router 8 (SSR) · React 19 · strict TypeScript (`noUncheckedIndexedAccess`) ·
Tailwind v4 · Lucide · Zod · Recharts · Papa Parse ·
SQLite + Prisma 7 (better-sqlite3 adapter) · decimal.js · Vitest.

No form library: the one mutation in the app is a native React Router `action` validating
with the same Zod schema the CLI uses, which works without JavaScript and keeps one source
for the vocabulary.
