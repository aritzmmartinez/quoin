# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.0] - 2026-09-14

### Added
- Ajustes screen at /ajustes, with the theme setting: Oscuro, Claro or Sistema. Sistema follows the operating system and updates with it.
- The theme is applied before the first paint, so a light theme no longer flashes dark on load.
- Sidebar sections (Cartera, Análisis, Sistema) and a collapsed mode that folds it down to icons. Collapsed items show their name on hover.
- While you are on Realizado, Coste de oportunidad or Coste del TER, those three appear nested under Resumen in the sidebar.
- Breadcrumb in the header, replacing the back link that sat above each subpage.
- Custom dropdown replacing the native select on Instrumentos, the holdings import, the symbol mapping step and the fiscal year picker. It is searchable where the list is long.
- Custom calendar for the date field of a savings plan version, replacing the native date input.
- 404 page for an address that matches no screen.
- Full page error state with a retry button, a link to Instrumentos and the time of the last attempt.
- Info glyph beside a title or a figure, opening its explanation on hover and pinning it on click. The long intro paragraphs of Realizado, Coste de oportunidad and Coste del TER now live behind it instead of above the table.
- Shared table styles (header, row, divider, numeric cell) used by the nine tables in the app.
- Geist Mono for every figure, so amounts line up column by column.
- Chart time axis that picks day or month ticks from the range shown, instead of always printing the month.
- Styled scrollbars and a styled slider for the concentration threshold.
- Tests for the tick spacing, the calendar grid and the popover placement.

### Changed
- New colour palette in both themes, with tokens for a subtle border, body text, faint text and an accent pair. The header height is a token too, so the error state can centre itself against it.
- Stat tiles redesigned: mono figures, an optional info glyph, an arrow when the tile is a link, and a quieter inset variant for tiles inside a card.
- New primary button variant, used for the main action of each error state, with fixed heights across the three sizes.
- Charts redesigned: accent colour for value, a dashed line for aportado, legend at the top left, richer tooltip, and a donut with separated segments over a track.
- File dropzone redesigned, with a larger target and a clearer hint.
- The inflation notice only appears when something is wrong. The reference month and how far behind it runs moved into the info glyph next to the badge in the header.
- Headers of Realizado, Coste de oportunidad and Coste del TER cut down to a single line of figures.
- The glossary moved from the header into the sidebar. On mobile it stays in the header, next to a link to Ajustes.

### Removed
- The light and dark toggle in the header, replaced by the theme setting in Ajustes.
- The back link component, replaced by the breadcrumb.
- The portfolio specific error card, folded into the shared error state.

## [0.7.0] - 2026-09-11

### Added
- A "Sincronizar IPC" button on the inflation notice (Resumen and /realizado). Whenever the CPI series needs a refresh — nothing stored, a gap in the range, or data stale enough that INE may have published without us noticing — it's one click instead of a trip to the terminal. pnpm ipc:sync still works exactly as before.
- Real mode now tells you when its CPI series is stale, instead of assuming it's "a few weeks behind" just because it's running. If nobody has synced in over 35 days (past one INE publication cycle), you'll see a different, more honest notice.
- A new Quoin favicon.
- A four-step import flow ("Importar operaciones") on /cartera: drop the CSV, map any symbols we don't recognise, fetch their prices, review the summary. You can always jump back to a step you've already completed.
- The broker is detected automatically from the file's header row — no selector to get wrong. A file that matches neither Trade Republic nor Kraken is refused by name, not guessed at.
- When mapping a symbol, you now see its quote, timestamp and implied position value — so a price that's off by a multiple is caught before it's saved. pnpm prices:map benefits from the same check.
- A shared dropzone component for both import flows (holdings and operations) — each keeps parsing its own way, but neither reinvents the drop target.
- A clearer step indicator for the import modal: checked steps, the current one outlined, the rest muted. Back and Next live at the bottom, separate from the action button, so moving and doing are never the same click.
- The import summary's "Descartadas" row can now expand — for unsupported movement types only — into the date, broker and instrument behind each one. Stock splits and share deliveries can change a real position, so those stay visible; routine noise like card spending doesn't.

### Changed
- IPC sync logic moved out of the script and into a shared function, used by both the CLI and the new sync endpoint behind the button. --force-rebase stays CLI-only — it wipes a series outright, too destructive for a button — though the endpoint will now tell you when a rebase is needed.
- The "last updated" tooltip on the basis badge now reflects when we last checked INE, not when the newest stored month arrived. A sync that finds nothing new still counts as a sync.
- The "no IPC data" notices no longer tell you to run a command — the button next to them does it for you.
- Import now writes to the ledger at step 1, with the later steps only filling in symbols and prices. The button says "Importar N operaciones", not "Confirmar" — and the operations stay saved even if you close the modal early. The last step is a summary, not a completion screen.
- The import modal can no longer be closed mid-request — Escape, the backdrop, the close button all wait until it resolves. (Chrome has its own opinion on double-Escape, so we reopen the dialog if it tries to force-close while something's still in flight.)
- Closing the modal after import but before the summary now asks first, and says plainly that your operations are already saved and where to finish mapping any leftover symbols.
- Both the mapping and summary steps now point you to Instrumentos to finish any symbols you skipped — and the mapping step makes clear upfront that skipping is fine.
- Price backfill and symbol remapping logic extracted into shared functions, so the CLI and the import flow don't drift apart.
- pnpm prices:backfill now points you to pnpm prices:sync when it's done — the freshest prices you just fetched don't count as "synced" until you run it.
- A new thesis field on each instrument (Core, Conviction, Tactical) — why you're holding it, not where the trade came from. Editable from /instrumentos, protected from being overwritten on re-import.
- The thesis chip only shows up when it's not Core — no more "Core" repeated on every row of five screens.

### Removed
- LedgerEntry.sleeve. Every adapter wrote it as "Core" and nothing ever set it to anything else, so the field it powered — AVCO lots, FIFO queues, wash-sale matching — was quietly keyed by instrument alone the whole time. Nothing changes for your tax figures; the partition was never really active.
- tradeMetaKey and the sleeve filters on ledger events and movement rows — dead code nobody was calling.

### Fixed
- An instrument held under two sleeves used to show up twice: duplicated in its exposure leaf, taking two Top-5 slots, double-counted in priced/unpriced totals. One instrument, one position, now.
- A repurchase inside the wash-sale window could dodge the rule if it happened to carry a different sleeve label. Art. 43 cares about the security, not our internal bookkeeping.

## [0.6.0] - 2026-09-05

### Added
- "Refrescar precios" button on /instrumentos, syncing quotes from the screen instead of only from the CLI. The toast reports partial runs with the misses split into stale quotes and symbols the provider never answered for, rather than reporting a clean success.
- The 15 % concentration threshold is now a slider, 5 % to 30 % in steps of 1.
- Shared button, two variants (default, ghost) and three sizes (md, sm, icon), replacing eleven hand-rolled buttons that had drifted into three paddings.
- Glossary modal reachable from the header on every page: 13 terms, each a one-line definition over a collapsed worked example.
- Back link on every subpage (/realizado, /coste-oportunidad, /coste-ter, /instrument/:id).

### Changed
- prices:sync logic extracted out of the script's main into syncPrices, so the CLI and the new route share one implementation and one set of counts. The script now only formats what the function returns.
- A quote symbol mapped by two instruments now syncs both. Keying the instrument by symbol collapsed them, so one got the price and the other was reported as "no quote returned".
- Shared modal, folding the four hand-rolled ones into a single implementation: the glossary and the three method notes.
- Replaced the four separate keys holding the word "Cerrar" with one. Four keys would be four translations of the same word the day a second locale lands.
- Proyección: the "Cómo se ha calculado" card moved behind a link into its own modal, one card fewer on the page.
- Coste del TER and Coste de oportunidad: the method footnotes under their tables moved behind a link into their own modals.
- Shared notelink, the underlined link that opens a modal of explanatory text. All three sites that had one were identical but for where the link sits.
- Resumen donut now classifies by exposureKind instead of Instrument.type. Trade Republic maps both FUND and SYNTHETIC to "ETF", so a physical-gold ETC was drawn as an index fund. Categories are now Acción, Fondo de renta variable, Fondo de bonos, Materias primas and Cripto. An instrument with no exposureKind set is reported as "Sin clasificar" instead of inheriting the broker's type, so the size of that slice is how much is still unmapped.
- The sidebar keeps the parent section highlighted while on one of its subpages.
- The instrument page's two hand-rolled back links folded into the shared one.

### Fixed
- Buttons had no pointer cursor anywhere in the app. Fixed once in the base layer.
- A disabled button no longer paints its hover background.
- Resumen allocation card: donut and legend are vertically centred in the card, which the grid stretches to match the taller Top posiciones beside it.
- Expanding a leaf named the company on every line instead of the fund it came through, which is the one question the expander exists to answer. Each contribution is now named after its container; the leaf itself still takes the direct position's name.
- A leaf reached through exactly one fund did not expand at all, so that fund stayed invisible, while a leaf held directly by two instruments expanded into two lines that both read "directa". A row now expands when some contribution arrives through a fund, not when it has more than one contribution.
- The expander was unreachable without a mouse.

## [0.5.2] - 2026-08-31

### Added
- Two spacing tokens unifying row/header padding and card inset across the app.
- Shared segmented control, replacing five duplicated implementations.
- Shared component for table intro/caveat/footnote prose, replacing four copies of the boxed caveat.

### Changed
- Ten duplicated route-level ErrorBoundarys folded into one shared component. Migrated from useRouteError() to the Framework Mode prop pattern.

### Fixed
- Removed nested main in /instrumentos and /objetivo.
- Explanatory text boxes now size to their content instead of a fixed width unrelated to the page.
- Instrument-page movements table (/instrument/:id): fixed missing flexible grid track that pushed the table against the left edge.
- Foral tax table (/realizado?vista=fiscal): fixed 20px header/row misalignment.
- Unified row/header padding and column gap across all 9 tables.
- Fixed the one table header still in small caps ( coste-oportunidad).
- Removed duplicated grid template on /coste-ter.

## [0.5.1] - 2026-08-28

### Added
- The running version is shown at the foot of the sidebar. Read from package.json in the _shell loader (server-side) and passed to the sidebar as a prop, so nothing pulls node:fs or the manifest into the client bundle.
- BENCHMARK_SYMBOL env var: the opportunity-cost benchmark (/coste-oportunidad and the Resumen card) can now be changed from the default global all-world ETF. Must be an instrument already mapped and backfilled with EUR history.

### Changed
- Dependencies bumped to their latest minors/patches, runtime (Prisma 7.10, React 19.2.8, papaparse 5.7, lucide-react, isbot) and dev (eslint, tailwindcss 4.3, vitest, tsx, typescript-eslint, vite, @types/*). No API changes.

### Fixed
- Instruments screen: a TER row stayed marked as unsaved after a correct save whenever the typed form was not byte-identical to the canonical one (0.22 vs 0,22, a trailing zero, surrounding spaces). The dirty check now parses the input through the same schema that decides the write and compares fractions.
- Fund overlap matrix (/asignacion?vista=solapamiento&modo=matriz): more spacing between the row number and the fund name.

### Removed
- MARKET_DATA_API_KEY from .env.example the Yahoo price provider takes no key and nothing read the variable.

## [0.5.0] - 2026-08-26

### Added
- Bizkaia foral tax module (/realizado?vista=fiscal): capital gains for the savings base, computed the way the foral return actually pairs a sale — FIFO by lot, not the AVCO the portfolio view uses. The same disposal has two correct answers depending on the question, so computeTaxLots is a second projection over the same ledger, never a replacement: it walks the events lot by lot per fiscal year (Madrid calendar), and nothing FIFO is stored. A loss on securities repurchased within two months is flagged and excluded from that year's deductible net — a deliberate simplification, the exclusion is shown on screen rather than silently deferred the way the real rule defers it. Unused losses carry forward four years, consumed oldest-first, recomputed from the ledger on every view. The 2026 savings-base bracket scale is applied to the resulting net to show the quota.
- pnpm tax:explain — replays the foral FIFO year by year against the real ledger, printing every lot each sale consumes, so the tax figure can be checked against the broker's own history rather than trusted.
- Fund overlap (/asignacion?vista=solapamiento): how much of any two funds is the same company, as Σ min(weight_A, weight_B) over the constituents both hold — the industry formula, applied to the funds actually owned rather than to a market-wide comparator. List and matrix views, switched with ?modo=matriz. The weight is the holding's weight inside its own fund, so the figure is a property of the two funds and does not move with how much is invested in each. A fund with no composition imported is left out and counted in the header, never given a false 0%, and a fund's undecomposed residual never crosses. A fund's cash buffer is excluded from the listed contributors — two funds holding yen is a settlement artefact, not a shared bet on a company — but not from the overlap figure, which stays arithmetically true.
- Currency exposure (/asignacion?vista=divisa): which currencies the portfolio does business in, through ETFs and cross-listings rather than by where each trade settles. Buying NVIDIA on Xetra in euros is dollar exposure, and a fund domiciled and quoted in EUR is not EUR exposure unless it hedges.
- Instruments screen: a per-instrument "hedged to EUR" flag, for the case no market data can reveal — a "Physical Gold USD (EUR Hedged)" ETC quotes on the same venue in the same currency as an unhedged one and differs only in the prospectus. Set by hand, like the TER; ingestion never writes it.
- pnpm identity:resolve --refresh — re-asks every identity including the ones already resolved. The cache never re-asks what it has placed, so this is what fills a column added after the fact.

### Changed
- Identity resolution now keeps the listing's exchange code from the same OpenFIGI response it already made. No extra requests: the field was being read to disambiguate and then discarded. The code is stored and the currency derived at read time, so correcting the translation table costs nothing.
- The currency of a holding is read first from the venue its issuer published (NVDA.US), which needs no provider at all and answers for four fifths of holdings. A bare ISIN falls back to its registered country, taken only when a real listing there confirms it — OpenFIGI publishes no primary-listing flag, and every large cap is composite-listed in a dozen countries.

### Fixed
- Holdings import: a fund's cash buffer became a company leaf instead of folding into the residual. The parser intended to fold it and only ever did so by accident, through the negative-weight test — the one fixture covering it carried negative cash, so the case that actually matters, an ordinary positive buffer with a usable ticker ("JPY", "JPY CASH"), went straight through as a constituent. Both the currency code and that code appearing as a whole word of the name are now required, so Nokia (ticker NOK, and NOK is the Norwegian krone) stays a holding. Existing funds keep their cash leaves until re-imported: EtfHolding is replace-only.
- Kraken staking rewards recorded the market value on receipt only as the acquisition cost of the lot, never as income. v0.4.0 fixed the cost side (a zero there inflated every later realised gain); the income side stayed invisible. A reward now also emits a DIVIDEND event for the same value — the "rendimiento de capital mobiliario" the foral return expects — sharing the refid but with a distinct externalId so both survive the dedup key. A reward with no price for that day is still discarded, never zeroed.

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

[Unreleased]: https://github.com/aritzmmartinez/quoin/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/aritzmmartinez/quoin/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/aritzmmartinez/quoin/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/aritzmmartinez/quoin/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/aritzmmartinez/quoin/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/aritzmmartinez/quoin/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/aritzmmartinez/quoin/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/aritzmmartinez/quoin/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/aritzmmartinez/quoin/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/aritzmmartinez/quoin/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/aritzmmartinez/quoin/releases/tag/v0.1.0
