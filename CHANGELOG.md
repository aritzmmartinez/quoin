# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-08-23

### Added
- Rebalance by contribution (/asignacion): split the next contribution across the active savings plan toward target weights without selling — no realised gain, no tax. The drift threshold shown is informative only; it never changes where the money goes.
- Projection engine (/proyeccion): p10/p50/p90 by bootstrap of each plan instrument's historical monthly returns, deterministic via a seeded PRNG. Plan and off-plan money are simulated as two correlated pots on the same drawn month. Refuses to print a figure below 60 months of shared history. Nominal and real, optional quartiles (?detalle=1). Two inverse modes: how much to contribute, and how long to reach a goal.
- pnpm projection:converge — measures, against the plan actually held, how many simulations the result needs to stop moving between seeds. Default raised from 3000 to 10000 based on a real run, not a guess.
- Opportunity cost (/coste-oportunidad): every real purchase replayed into VWCE.DE at that day's close, so "would I have more money in the index" gets an answer. Difference in euros and in MWR, plus a per-position breakdown, both sides paying the same fees.
- TER cost (/coste-ter, plus a tile on Resumen): what fund management fees cost per year, and what they add up to over the projection horizon. TER is entered by hand per instrument; an instrument without one is excluded and named rather than assumed free, so the projected cost is a floor, not an estimate.

## [0.3.0] - 2026-08-20

### Added
- Portfolio target: the savings plan now lives in Quoin (/objetivo), versioned by date, weight derived from the monthly amount. pnpm target:set <file> records a version from a plan file.
- Realised P&L by sale: /realizado lists every closed sale with cost consumed, result in € and %, holding period, grouped by year. Valued at AVCO in force at the instant of the sale — explicitly not FIFO.
- Real (inflation-adjusted) returns: a nominal/real toggle on Resumen and /realizado restates past amounts in today's purchasing power, using INE's monthly CPI  (national and Bizkaia). pnpm ipc:sync fetches the series; a missing month blocks real mode instead of interpolating.
- Portfolio-level TWR and MWR, shown side by side on Resumen. XIRR via Newton-Raphson with bisection fallback; returns null rather than a guessed number when it can't solve.
- pnpm twr:explain — audits the TWR chain link by link, isolating which sub-periods drive an extreme figure and whether the cause is a real price move or a bad snapshot.
- pnpm db:backup — consistent snapshots of the live ledger via VACUUM INTO, with integrity check and 30-snapshot rotation.
- pnpm db:seed — synthetic scratch database for development, covering known bug shapes (fees, unpriced positions, partial sells).
- Destructive commands now refuse to run against anything but a confirmed local ledger.

### Fixed
- Kraken staking rewards are valued at market price on receipt instead of zero cost.
- Seeded database no longer crashes every screen: LedgerEntry.type is now constrained to the six types the domain models (FEE/TAX_WITHHOLDING/SPLIT were never modelled and no broker emits them).

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

[Unreleased]: https://github.com/aritzmmartinez/quoin/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/aritzmmartinez/quoin/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/aritzmmartinez/quoin/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/aritzmmartinez/quoin/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/aritzmmartinez/quoin/releases/tag/v0.1.0
