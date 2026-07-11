# core — pure domain

Business logic, agnostic to the framework, the database and HTTP.

Rule (enforced by lint, not by convention):
- `core` MUST NOT import from `adapters` or `app` (routes, components).
- If `core` needs the outside world, it declares it as an interface in `core/ports`
  and an adapter implements it.

Contents:
- `domain/`      value objects (Money as string + decimal.js), ledger event types (Zod schemas)
- `ports/`       interfaces: `LedgerRepository`, `InstrumentRepository`, `MarketDataProvider`, `PriceRepository` (planned: `FxProvider`, `TaxJurisdiction`)
- `projections/` pure functions: `computePositions` (average cost), `computeTradeMeta` (planned: FIFO lots, allocation, look-through)
- `tax/`         (planned) `TaxJurisdiction` implementations (bizkaia, common, ...)
