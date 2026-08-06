# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Classifying an instrument as a fund (`EQUITY_FUND`/`BOND_FUND`) no longer fails with
  "Datos no válidos": the leaf input is disabled for kinds that don't need one, and a
  disabled input isn't submitted, so an absent leaf is now accepted as "none".

## [0.1.0] - 2026-07-27

First tagged release. A portfolio can be taken from a broker CSV all the way to true
look-through exposure: what you actually own once every fund is opened up, counting a
company once whether you bought it directly or it arrived inside an index.

Local-first and self-hosted throughout — no account, no server, no data leaving the
machine. Not feature-complete: the tax module and the trading sleeve are still ahead, and
fund holdings must be supplied as CSV rather than the Excel most issuers publish.

### Ledger and ingestion
- Immutable event ledger as the single source of truth; every figure is derived from it
- CSV import for Trade Republic and Kraken, idempotent by the broker's own transaction id
- Money is decimal throughout, never a float

### Market data
- Yahoo price provider behind a port, with daily history backfill
- Per-instrument quote symbols and exposure classification live only in the local
  database, never in the repository

### Screens
- **Resumen** — portfolio value, evolution, allocation by type, largest holdings
- **Cartera** — holdings with value, unrealized P&L and weight, sortable via the URL
- **Movimientos** — the full ledger, paginated via the URL
- **Instrumentos** — classify what a fund really is, and import its composition
- **Asignación** — look-through exposure, direct versus via-fund, with a concentration
  threshold
- **Detalle de activo** — TWR and money-weighted return side by side, price with trade
  marks and stepped average cost, contributed versus value

### Look-through
- One holdings parser for every issuer, with no per-provider branch: the weight column is
  found by being the one that adds up to about 100
- Fund compositions imported by dropping the issuer's CSV onto its row
- Canonical identity via OpenFIGI, so a company held directly and inside a fund counts
  once. Share classes such as GOOG and GOOGL stay separate, because they are separate
  securities
- What cannot be broken down is reported rather than spread across what is known

### Foundations
- Layered architecture (app → adapters → core) with the dependency direction enforced by
  lint
- Zod schemas as the single source of both types and validation
- 384 unit tests plus an integration test against a real SQLite database; lint, type-check,
  build and test on every push

Design rationale lives beside the code it explains, in `docs/ARCHITECTURE.md` and in the
commit history — not here.

[Unreleased]: https://github.com/aritzmmartinez/quoin/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/aritzmmartinez/quoin/releases/tag/v0.1.0
