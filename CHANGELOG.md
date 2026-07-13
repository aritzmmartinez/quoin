# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Project scaffold: React Router 8 (SSR) + React 19 + TypeScript (strict) + Tailwind v4
- Layered architecture (app → adapters → core) with the dependency direction enforced by lint
- Design tokens: Trade Republic-style monochrome palette, tabular numerals, dark-first theme
- Persistence: Prisma 7 + SQLite via the better-sqlite3 driver adapter. Immutable ledger schema (Instrument + LedgerEntry) with a unique constraint for idempotent ingestion
- Continuous integration: lint, type-check and build on every push and pull request
- Core domain: Money (decimal.js), ledger event types, LedgerRepository port, and the computePositions projection (weighted-average cost) with unit tests
- Ledger domain schemas (Zod, single source of truth for types and validation)
- Persistence adapter: Prisma LedgerRepository (idempotent append, chronological list) with row<->event mappers and an integration test.
- CSV ingestion for Trade Republic and Kraken on a shared ingestion layer (batch builder + persist step; card spending and non-BTC crypto filtered; dedup by source transaction id).
- Portfolio screen (index route): server loader derives current holdings from the ledger (computePositions + trade metadata), joined with instrument data and sorted via URL search params. Shows instrument, type, quantity, average cost, invested amount and realized P&L, with expandable per-position detail (ISIN, currency, asset class, first/last trade, trade count). Reusable presentation layer: es-ES formatters, centralized Spanish copy, and design-system components (Card, SleeveChip, SignedMoney, sortable table). Market-derived columns (value, unrealized P&L, weight) intentionally deferred until a price provider exists. Closed positions are excluded from the holdings view
- Market-data provider (Yahoo): agnostic MarketDataProvider and PriceRepository ports in core; YahooMarketDataProvider adapter over the chart endpoint with a pure, tested response parser; append-only PriceSnapshot table (idempotent per instrument+quote-time). Each instrument carries an optional quoteSymbol (EUR venues preferred to avoid FX), set locally via pnpm prices:map <ISIN> <SYMBOL> or Prisma Studio and never written by ingestion, so a public repo never discloses holdings. pnpm prices:sync fetches quotes for instruments that have a symbol and persists snapshots, reporting the rest. Prices are not yet surfaced in the UI
- Holdings screen now shows market data: Valor, P&L (unrealized) and Peso columns, plus total value, total unrealized P&L and an "Actualizado hace X" freshness indicator. Values come from the latest persisted price snapshot (base-currency quotes only; foreign-currency quotes await FX). Unpriced positions show "—" and sink to the bottom; default sort is portfolio weight. Realized P&L moves to the expandable detail. New pure projection computeMarketValues (value/unrealized/weight) with tests

[Unreleased]: https://github.com/aritzmmartinez/quoin/commits/main