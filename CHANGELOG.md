# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Projection engine (/proyeccion): where the portfolio could be in N years if the active savings plan keeps being funded, answered as p10/p50/p90 rather than as a single line that pretends to know the future. The monthly return series is synthetic — each instrument's own monthly returns at fixed weights — because the historical portfolio TWR mixes compositions that no longer exist. **Money inside the plan and money outside it are simulated as two separate pots**: the planned one takes the contributions at target weights, the off-plan one is never funded and compounds at its own weights, so a position in bitcoin is never lent the plan's variance. Both pots advance on the same drawn month, so the correlation between them survives. The window is truncated to the plan line with the least history and that instrument is named; an off-plan position that does not cover it is reported with its value and left unsimulated, never added in flat at 0%. Deterministic: a seeded PRNG means the same plan always yields the same figures. Nominal and real are both shown, real deflated by the historical average of the CPI series already in the database. Two inverse modes on the same screen: how much to contribute to reach a goal in a given horizon, and how long the current contribution takes to reach it — both bisections over the same bootstrap, both answering about the median and saying so. A plan line with no price history at all is named and excluded, with the share of the plan actually covered stated, instead of being silently renormalised away.
- The projection refuses to print a number below 60 months of shared history, and states which instrument fell short and by how much. A bootstrap over one market regime compounded for decades is an extrapolation of that regime, and a caveat under a large figure stops being read — the same reasoning that has a CPI hole disable real mode outright. Above the threshold the window's implied annualised return stays on screen, so "more months" never has to be taken for "trustworthy".
- pnpm projection:converge — measures how far p10/p50/p90 move between seeds at several simulation counts, over the plan actually held, so the number of simulations stops being a value picked from a plausible range and becomes a measured one. Monte Carlo error falls as 1/√N while cost rises linearly, and linearly times ~60 on any screen that also solves a goal, so the trade-off is printed alongside the spread. The tails converge later than the median, so all three percentiles are reported separately: a settled median is not evidence.
- Optional quartiles on the projection (`?detalle=1`, a checkbox on the screen). Off by default and the default panel is unchanged: p25 and p75 are **inserted** between the three scenarios rather than replacing them. They cost nothing — the simulation already sorts every drawn path, so a quartile is two more reads of the same array, never another run.
- Rebalance by contribution: enter the next contribution on /asignacion and Quoin splits it across the active savings plan so the portfolio moves back towards its target weights **without selling anything** — no realised gain, so no tax. Each line's ideal is its target weight of the post-contribution portfolio, and the money is split in proportion to each line's shortfall; a line already at or above its ideal gets nothing. The split adds up to the contribution to the cent. A plan line that is held but unpriced is left out of the split and named, never passed in as zero, and a position the plan no longer names is reported rather than funded. The drift threshold is configurable on screen (`?desvio=2`) and is informative only — it changes what the panel says about the drift, never where the money goes. The suggestion is a hypothesis: nothing is persisted and no order is placed.

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

[Unreleased]: https://github.com/aritzmmartinez/quoin/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/aritzmmartinez/quoin/compare/v0.3.0...HEAD
[0.2.0]: https://github.com/aritzmmartinez/quoin/compare/v0.2.0
[0.1.0]: https://github.com/aritzmmartinez/quoin/releases/tag/v0.1.0
