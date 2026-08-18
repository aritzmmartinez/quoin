# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- The savings plan lives in Quoin: a portfolio target says how much goes into each instrument every month, and /objetivo shows the one in force with its weights. The amount is the fact and the weight is derived from it on every read, because the plan is written in euros ("300 into FTSE") and storing both numbers invites the day they disagree. A target may name an instrument never bought — the plan is where a position starts, so a line with no position keeps its full weight and shows its raw identifier.
- A target line joins its instrument by exact id, so an id that differs from an imported one only in case is refused — by the CLI and by the screen — rather than recorded: it would be indistinguishable from "not bought yet" forever. An id that resembles nothing imported is accepted and reported as a warning, because a plan legitimately runs ahead of the portfolio, and the screen tells the two apart ("sin importar todavía" vs "sin posición todavía").
- Targets are versioned by activeFrom and never edited: changing the plan records the next version, and the one that applied on any past date stays answerable — resolved by the business date, never by when the row was written. pnpm target:set <file> records a version from a plan file, in the same line format the screen's textarea accepts.
- pnpm db:backup snapshots the ledger with VACUUM INTO — a consistent copy rather than a file copy that might catch the database mid-write — into data/backups/, keeping the last 30. It always backs up the live ledger and deliberately ignores DATABASE_URL, so it cannot quietly archive a scratch database and report success. Each snapshot is checked with PRAGMA integrity_check and a per-table row-count comparison before it counts as one: a copy that fails is deleted rather than kept, because a bad snapshot that still counted would push the oldest good one out of the window. Rotation only ever removes files matching the timestamped name it generates, so a copy you put there by hand stays put.
- pnpm db:seed fills a scratch database with a synthetic portfolio, so development never needs the real one. Everything in it is invented, and the shape includes the cases that have caused bugs: fees on every purchase, an unpriced position, a fund with no holdings, two funds sharing constituents, and a partial sell.
- Destructive commands refuse to run against the live ledger, and refuse just as firmly when DATABASE_URL is unset or does not resolve to a local SQLite file — a guard that passes when it cannot tell what it is guarding is not a guard.

### Fixed
- A Kraken reward is no longer recorded at a cost of zero. Units arrive with no counter-leg in the file, so their acquisition value comes from the stored price history at the moment of receipt — the value the foral rule taxes as income, and the cost of those units from then on. Zero was wrong twice over: it hid the income and handed the whole value back as a realised gain on the eventual sale. A reward whose day has no price is discarded and reported as reward-unpriced, never valued at zero; run pnpm prices:backfill BTC and import again, which dedup by refid makes safe.
- pnpm db:seed no longer writes an instrument with type "FUND", which is not an InstrumentType: instrumentSchema rejected it, so every read of the seeded database threw before rendering anything.
- A seeded database no longer takes every screen down. LedgerEntry.type is now constrained at the database to the six types the domain models, and the seed's one "FEE" row — a custody fee, which is cash leaving the account and so a WITHDRAWAL — is written as a type that can be read back. FEE, TAX_WITHHOLDING and SPLIT were advertised in the schema and modelled nowhere; no broker emits them either, since fees arrive as a column on the operation. A row the database accepts but the domain refuses is an outage on a screen far from the insert that caused it.

## [0.2.0] - 2026-08-08

### Added
- Import fund holdings straight from an issuer's .xlsx, not only CSV — the format most issuers actually publish, so the file no longer has to be converted by hand. The workbook is rendered to CSV in the browser and fed to the existing parser unchanged; the holdings sheet is the one that parses, a disclaimer or cover sheet is skipped, and a workbook with two holdings-shaped sheets is refused rather than guessed. SheetJS loads only when a workbook is dropped and never enters the server bundle.

### Fixed
- A market-allocation export (weights by country, no securities) is no longer read as holdings with each country becoming a company: a column that is mostly country names can no longer be taken as the identity.
- The weight column can no longer also be taken as the identity — short numeric weights have the shape of tickers, which let a numeric-weight allocation file slip through.
- Classifying an instrument as a fund (EQUITY_FUND / BOND_FUND) no longer fails with "Datos no válidos": the leaf input is disabled for kinds that don't need one, and a disabled input isn't submitted, so an absent leaf is now accepted as "none".
- Position weights are shown to two decimals with a "<0,01%" floor for a holding that is tiny but real — a company reached only through a fund — across Allocation and the holdings preview, so it reads as present, at its true magnitude, not "0,0 %".
- prices:map warns when the position is closed (0 units held): a zero implied value can't sanity-check the symbol against what was paid, so the venue must be checked by hand.
- prices:backfill warns when Yahoo silently degrades a long range to weekly candles.

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

[Unreleased]: https://github.com/aritzmmartinez/quoin/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/aritzmmartinez/quoin/compare/v0.2.0
[0.1.0]: https://github.com/aritzmmartinez/quoin/releases/tag/v0.1.0
