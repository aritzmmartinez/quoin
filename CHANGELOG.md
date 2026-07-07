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

[Unreleased]: https://github.com/aritzmmartinez/quoin/commits/main