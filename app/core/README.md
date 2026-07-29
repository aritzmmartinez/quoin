# core — pure domain

Business logic, agnostic to the framework, the database and HTTP.

Rule (enforced by lint, not by convention):
- `core` MUST NOT import from `adapters` or `app` (routes, components).
- If `core` needs the outside world, it declares it as an interface in `core/ports`
  and an adapter implements it.

Contents:
- `domain/`      value objects (Money as string + decimal.js), ledger event types (Zod schemas), exposure leaves, and the three steps that turn a position into leaves: `resolveIntrinsic`, `resolveWithHoldings`, `canonicaliseLeaves`
- `ports/`       interfaces: `LedgerRepository`, `InstrumentRepository`, `MarketDataProvider`, `PriceRepository`, `HoldingsRepository`, `SecurityIdentityResolver`, `SecurityIdentityRepository` (planned: `FxProvider`, `TaxJurisdiction`)
- `projections/` pure functions: `computePositions` (average cost), `computeTradeMeta`, `computeReturns` (TWR + XIRR), `computeAllocation`, `computeExposures` (look-through) (planned: FIFO lots)
- `tax/`         (planned) `TaxJurisdiction` implementations (bizkaia, common, ...)

## Exposure: a leaf is not necessarily a company

Every position resolves to leaves whose weights sum to 1. A leaf is `{kind, id}` with the
kind spelled out — `COMPANY`, `COMMODITY`, `CRYPTO`, `UNRESOLVED` — which is what stops
gold and crypto from being special cases threaded through the code.

Three separate steps, and keeping them separate is the point:

- **`resolveIntrinsic`** — what an instrument is on its own. A stock is a company, a gold
  ETC is a commodity, a fund with no composition on file is one opaque leaf.
- **`resolveWithHoldings`** — what a fund contains, once its composition is imported.
- **`canonicaliseLeaves`** — what two containers agree to call the same thing. Resolution
  asks about one instrument; canonicalisation asks about the relationship between two, and
  folding it into the resolvers would make them untestable without a lookup table.

`computeExposures` takes `WeightedLeaf[]` and does not care where the leaves came from,
which is why a fund going from one leaf to nine hundred changed nothing in the projection.

## Rules that were expensive to learn

- **What cannot be broken down is reported, not spread.** An undecomposed fund is an
  `UNRESOLVED` leaf with its own value. Pro-rating it across the leaves we do know would
  invent a concentration that nobody holds. This applies inside a fund too: one published
  with only its top ten resolves to eleven leaves.
- **Contributions are stored, not summed.** "NVIDIA 11.2%" is not actionable; "9.7% held
  directly and 1.5% inside the index funds" is, because only the first part can be acted
  on — the rest is the cost of owning the market. The provenance is lost in a fold, so the
  fold keeps it (`weightInParent: null` means a direct holding).
- **Exposure kind is never inferred from a name.** An ETF of gold *miners* has "Gold" in
  its name and resolves to companies. Brokers do not report the difference either — Trade
  Republic labels an equity ETF and a physical-gold ETC identically — so a human classifies
  it once, and the type system keeps ingestion from overwriting that.
