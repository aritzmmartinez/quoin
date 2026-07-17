# core — pure domain

Business logic, agnostic to the framework, the database and HTTP.

Rule (enforced by lint, not by convention):
- `core` MUST NOT import from `adapters` or `app` (routes, components).
- If `core` needs the outside world, it declares it as an interface in `core/ports`
  and an adapter implements it.

Contents:
- `domain/`      value objects (Money as string + decimal.js), ledger event types (Zod schemas), exposure leaves and intrinsic resolution
- `ports/`       interfaces: `LedgerRepository`, `InstrumentRepository`, `MarketDataProvider`, `PriceRepository` (planned: `FxProvider`, `TaxJurisdiction`)
- `projections/` pure functions: `computePositions` (average cost), `computeTradeMeta`, `computeReturns` (TWR + XIRR), `computeAllocation`, `computeExposures` (look-through) (planned: FIFO lots)
- `tax/`         (planned) `TaxJurisdiction` implementations (bizkaia, common, ...)
