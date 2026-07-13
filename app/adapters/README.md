# adapters — the edge

Everything that touches the outside world. Implements the `ports` defined in `core`.

Rule (enforced by lint):
- `adapters` may import from `core`, NOT from `app`.
- Swapping broker / price provider / country = a new adapter, `core` untouched.

Contents:
- `ingestion/`   `TradeRepublicCsvAdapter` + `KrakenCsvAdapter` (CSV -> ledger events; filters card spending / non-BTC crypto; dedup by transaction id)
- `persistence/` Prisma 7 + SQLite (schema, generated client, ledger/instrument/price repositories)
- `marketdata/`  `YahooMarketDataProvider` behind the `MarketDataProvider` port; per-instrument `quoteSymbol` mapping (kept in the local DB, not the repo)
- `fx/`          (planned) exchange rates for non-EUR quotes (e.g. ECB / `EURUSD=X`)
