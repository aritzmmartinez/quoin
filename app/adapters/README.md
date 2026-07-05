# adapters — the edge

Everything that touches the outside world. Implements the `ports` defined in `core`.

Rule (enforced by lint):
- `adapters` may import from `core`, NOT from `app`.
- Swapping broker / price provider / country = a new adapter, `core` untouched.

Contents:
- `ingestion/`   TradeRepublicCsvAdapter (CSV -> ledger events; filters card spending; dedup by transaction_id)
- `persistence/` Prisma 7 + SQLite (schema, generated client, repositories)
- `marketdata/`  quotes behind PriceProvider + manual fallback
- `fx/`          exchange rates (ECB)
