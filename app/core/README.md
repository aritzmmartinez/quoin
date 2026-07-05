# core — pure domain

Business logic, agnostic to the framework, the database and HTTP.

Rule (enforced by lint, not by convention):
- `core` MUST NOT import from `adapters` or `app` (routes, components).
- If `core` needs the outside world, it declares it as an interface in `core/ports`
  and an adapter implements it.

Contents:
- `domain/`      value objects (Money, Isin), ledger event types
- `ports/`       interfaces: Repository, PriceProvider, FxProvider, ImportAdapter, TaxJurisdiction
- `projections/` pure functions: positions, lots (FIFO), P&L, allocation, look-through
- `tax/`         TaxJurisdiction implementations (bizkaia, common, ...)
