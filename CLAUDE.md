# CLAUDE.md

Guidance for agents working in this repository.

## Project

**Quoin** — a local-first, self-hosted investment management platform.

It is a real tool, used daily against real holdings, and it is developed in the open.
Two consequences shape everything below:

- **The numbers must be right.** This is not a demo. A wrong valuation is not a cosmetic
  bug — it misinforms an actual financial decision. Correctness beats velocity; when a
  projection is ambiguous, the ambiguity gets resolved and documented, not averaged over.
- **The repository is public; the portfolio is not.** Code, architecture and reasoning are
  meant to be read. Holdings, symbols, quantities and broker exports are not, and never
  enter version control (see *Privacy*).

License: AGPL-3.0-only.

## Language policy

- Code, comments, identifiers, commit messages, docs and this file: **English**.
- UI: **Spanish**, and only via `app/lib/i18n.ts` (a typed `es` object `as const`).
  Never hardcode a user-facing string in a component.
- Formatting: es-ES, and only via `app/lib/format.ts` (`formatMoney`, `formatQuantity`,
  `formatSignedMoney`, `formatDate`, `formatPercent`, `formatRelativeTime`).
  Never call `toLocaleString` from a component.
- Note on es-ES: CLDR `min2` means 4-digit numbers carry **no** thousands separator
  (`1234,56 €`). This is correct output, not a bug.

## Commands

```
pnpm dev                          # dev server
pnpm build                        # production build
pnpm typecheck                    # tsc
pnpm lint                         # eslint
pnpm test                         # vitest, unit
pnpm test:watch
pnpm test:integration             # migrate deploy against a temp sqlite db
pnpm db:generate                  # prisma generate
pnpm db:migrate                   # prisma migrate dev
pnpm db:studio
pnpm db:backup                    # VACUUM INTO data/backups/, keeps the last 30
pnpm db:seed [--anchor=YYYY-MM-DD]   # synthetic portfolio into the scratch database
pnpm ingest --broker=<tr|kraken> <file>
pnpm prices:sync                  # quote every mapped instrument
pnpm prices:map <ISIN> <SYMBOL>   # set / show / --clear a Yahoo symbol
pnpm prices:backfill [ISIN] [1y|2y|5y|10y|max]   # daily history, default 5y
pnpm exposure:map                 # list how every instrument resolves
pnpm exposure:map <ISIN> <KIND> [LEAF]           # e.g. XS2183935274 COMMODITY XAU
pnpm identity:resolve [--limit N] [--all] [--retry-ambiguous] [--report]
pnpm ipc:sync [--force-rebase]        # INE consumer price index, national + Bizkaia
pnpm target:set                       # show the savings-plan target in force today
pnpm target:set <file> [--from=YYYY-MM-DD] [--name=…] [--note=…]   # record a version
pnpm twr:explain [--top=N]            # print the portfolio TWR chain, worst link first
pnpm twr:explain --around=YYYY-MM-DD  # open one link: holdings and implied prices at both ends
```

Fund compositions have **no command**: the CSV is dropped onto the fund's row in
`/instrumentos`. That was a deliberate product decision — one more command is one more
thing only the author can use.

TypeScript is `strict` with `noUncheckedIndexedAccess`. Indexed access returns
`T | undefined` — handle it, do not assert it away.

## Architecture — three layers

```
app  →  adapters  →  core
```

`core` imports from nothing. Enforced by native ESLint `no-restricted-imports` with
per-folder overrides. (`eslint-plugin-boundaries` v6 was tried and abandoned — heavier
and it did not enforce this correctly.)

- **core** — domain and pure projections. No Prisma, no `fetch`, no I/O, no clock.
  Anything from the outside is **injected**: e.g. `computeAllocation` receives a
  `Map<instrumentId, category>` because core cannot read `Instrument.type` from Prisma.
- **adapters** — persistence (Prisma repositories), market data (Yahoo), ingestion (broker
  CSV + issuer holdings), identity (OpenFIGI).
  Keep parsing **pure and separately tested** from the I/O that feeds it
  (`parseYahooChart`, `parseHoldingsCsv`, `canonicalFrom` are pure; the providers fetch).
  The holdings parser being pure is what lets the browser run it for a preview and the
  server run the same function again to store — the client parses to show, the server
  parses to keep, and the server trusts nothing it is handed.
- **app** — routes, loaders, components.

No monolithic files. Extract reusable primitives (`ui/`, `charts/`) rather than
duplicating logic across screens.

## Money rules

- Prisma's `Decimal` has a **confirmed read bug on SQLite**. Every money and quantity
  field is stored as `String` and operated on with **decimal.js**. Do not "fix" the schema
  by switching to `Decimal` or `Float`.
- `Money` is constructed **only from strings, never from numbers**. A number in the
  constructor is float contamination at the boundary.
- Never use `+ - * /` on monetary values. Use `Money` methods.

## Prisma 7 paths — two different bases

This has caused misdirected generation more than once:

- `DATABASE_URL` resolves relative to the **project root** → `file:./data/quoin.sqlite`
- generator `output` resolves relative to **`schema.prisma`** →
  `../app/adapters/persistence/generated`

## Market data invariants

- `latest()` resolves by `asOf` (market time), **not** `createdAt` (sync time).
  This matters because `prices:backfill` writes hundreds of historical candles in a single
  run, all sharing `createdAt = now`. Ordering by `createdAt` surfaces a years-old candle
  as the current price and corrupts every valuation downstream.
- Stale-quote protection lives at the **write** boundary, not the read: `isFreshQuote`
  discards quotes whose market timestamp is older than 7 days, and it applies **only** to
  `prices:sync`. Yahoo serves stale candles on illiquid venues.
- `prices:backfill` deliberately does **not** apply that filter. Discarding old quotes is
  correct for "what is this worth now" and wrong for "what was this worth then".
- `backfill` issues **sequential** requests (the chart endpoint is unofficial and
  rate-limits) and drops sessions without a close rather than interpolating.
- `PriceSnapshot` is append-only and idempotent via `@@unique([instrumentId, asOf])`.
- Remapping an `Instrument.quoteSymbol` **deletes** that instrument's existing snapshots.
  Two symbols' prices must never share a series.

## The live ledger — never the agent's target

`data/quoin.sqlite` holds real trades and is the only thing in this project that cannot
be regenerated. Prices re-sync, holdings re-import, the Prisma client regenerates; a
destroyed ledger is fourteen months of broker exports re-entered by hand.

Three defences, and it is worth knowing which one actually carries the weight:

1. **The environment override — this is the load-bearing one.** `.claude/settings.json`
   sets `DATABASE_URL` to the scratch database for the session, and `dotenv` does not
   overwrite a variable already in the environment, so it beats `.env` without anyone
   having to remember. Everything that reads `DATABASE_URL` is pointed away from the
   ledger by default rather than by discipline.
2. **`assertScratchDatabase` in `scripts/lib/db-target.ts`** — the programmatic barrier
   for code in this repo. It is an **allow-list**: the target must be exactly
   `data/dev.sqlite`. "Not the ledger" would wave through `data/quoin.sqlite.bak`, a
   mistyped path, or a snapshot under `data/backups/` — every one a file nobody chose to
   destroy. It also **fails closed**: unset, in-memory or non-`file:` refuses too,
   because a guard that passes when it cannot tell what it is guarding is not a guard.
   Run it as the *first* link of a destructive chain (`scripts/db-guard.ts`), never the
   second — `db:seed` used to run `prisma migrate deploy` before the guard spoke.
3. **The deny-list in `.claude/settings.json` — a speed bump, not a barrier.** Do not
   rely on it and do not describe it as protection. It matches *invocation patterns*, so
   it catches `pnpm prisma migrate reset` and misses a wrapper script, an unlisted
   package.json alias, or three lines of TypeScript calling `fs.unlink`. Its job is to
   make the obvious destructive command require a deliberate second step.

**Deny rules govern the agent's own file tools, not its child processes.** `Read(./data/quoin.sqlite)`
stops the agent from opening the ledger with the Read tool; it does nothing to a process
launched through bash. That is exactly why `pnpm db:backup` can read and copy the 8.9 MB
ledger while that rule is in force. Useful, but do not mistake it for a sandbox.

- **`pnpm db:backup` deliberately ignores `DATABASE_URL`** and always snapshots the live
  ledger. A backup command that followed the environment would archive the scratch
  database and report success. It is the one script that opens the irreplaceable file on
  purpose, so it checks its own work: `PRAGMA integrity_check` plus a per-table row-count
  comparison against the source, **before** rotating. `VACUUM INTO` returning cleanly
  says the statement ran, not that the result opens — and a bad snapshot that still
  counted as one would push the oldest good backup out of the 30-file window, so a single
  corrupt copy would cost two. A failed verification deletes the copy and exits non-zero.
- The seed is **synthetic and stays synthetic** — same reason fixtures are (see *Privacy*).
  It encodes the shapes that have caused bugs: `fees ≠ 0`, an unpriced position, a fund
  with no holdings, two funds sharing constituents, a partial sell.

## Privacy and the no-clobber rule

`Instrument.quoteSymbol`, `exposureKind` and `exposureLeafId` are set by CLI or the
instruments screen and live **only** in the local, gitignored SQLite database. Never commit
symbols, ISINs, quantities, holdings or broker exports — this repo is public and that data
would publish the author's portfolio. `*.csv` is gitignored.

**Test fixtures are synthetic, always.** This bites in a non-obvious place: the set of funds
whose compositions get imported *is* the portfolio. A parser test using the real Vanguard
and Amundi exports would disclose which funds are held, as surely as committing a
`quoteSymbol` would. Copy the shape, invent the data.

Ingestion must never write those three columns. This is enforced by the type, not by
convention — `InstrumentWriteData` is `Omit<InstrumentRow, "quoteSymbol" | "exposureKind" |
"exposureLeafId">`. Ingestion upserts **every** instrument on **every** import, so any
column it can write is a column it will eventually overwrite. If you widen that type, a
re-import silently destroys hand-set mappings.

## Yahoo symbol mapping traps

An ISIN trades on many venues. Always map the **EUR-denominated venue line**, never the
ISIN itself, and always sanity-check the price magnitude.

- **Never map an ISIN as a `quoteSymbol`** (e.g. `XS2183935274.SG`). Yahoo resolves the
  ISIN to a quote, but has no historical series under that key — `timestamps` and `closes`
  come back `null` and `backfill` returns 0 candles. Use the venue ticker.
- **Verify the price magnitude, not just the currency.** Several symbols quote in EUR and
  pass the currency filter yet are a different fund tracking the same index, or the same
  fund with a different entitlement per certificate — observed at 5.5x, 0.5x and 0.4x the
  correct line. Check the candidate price against the broker's own `amount / quantity` for
  a real trade before committing the mapping.

## Exposure and look-through

- **A leaf is not necessarily a company.** `LeafId` is `{ kind, id }` — gold is
  `COMMODITY:XAU`, BTC is `CRYPTO:BTC`, a stock is `COMPANY:<ISIN>`. Making the kind
  explicit is what keeps commodities and crypto from being special cases bolted onto a
  company-shaped model.
- **What cannot be decomposed is reported, not spread.** A fund with no holdings data
  resolves to a single `UNRESOLVED` leaf carrying its own value. Pro-rating it across the
  known leaves would invent a concentration that isn't there. Same rule as `unpricedCount`.
- **`Instrument.type` cannot classify a fund.** Trade Republic maps both `FUND` and
  `SYNTHETIC` to `"ETF"`, so a physical-gold ETC is stored as an ETF and is
  indistinguishable from an index fund. The information is not in the CSV — a human sets it
  once via `exposure:map`. Never infer it from the instrument name: an ETF of gold *miners*
  has "Gold" in its name and resolves to companies, not to metal.
- **`computeExposures` takes `Map<instrumentId, WeightedLeaf[]>`** — an array, always. That
  seam paid off exactly as intended: when look-through landed, a fund went from one leaf to
  nearly four thousand and the projection did not change a line. The resolver changes; the
  projection does not.
- **Three separate steps, and they stay separate.** `resolveIntrinsic` (what an instrument
  is alone) → `resolveWithHoldings` (what a fund contains) → `canonicaliseLeaves` (what two
  containers agree is the same thing). Folding canonicalisation into the resolvers would
  make them untestable without a lookup table. It touches `COMPANY` leaves only: gold has no
  share class, and mapping other kinds through would merge distinct things on an id clash.
- **A merged leaf takes the direct position's name.** Once identities merge, the broker's
  "NVIDIA" and an issuer's "NVIDIA Corp" compete for one leaf; without a rule the winner is
  whichever instrument was iterated first, which is not a rule.
- **Contributions are kept, not summed.** "NVIDIA is 11.6%" is not actionable; "9.9% direct,
  1.4% via FTSE" is. The provenance is lost in the fold, so the fold keeps it.
  `weightInParent: null` marks a direct holding, distinct from a 100% constituent.
- **Leaf totals are derived (`leafTotal`), never stored.** Storing both invites the day they
  disagree — which is exactly how the fee bug happened.

## Holdings import — one parser, no issuer branches

Six real issuer exports built this and none needed a rule of its own. A seventh must need
no code; if you find yourself adding `if (issuer === ...)`, the design has failed.

- **The weight column is the one whose values add up to ~100** (or ~1 — some publish
  fractions, and the two ranges cannot overlap). This survives language, layout and number
  format, and doubles as verification: if nothing adds up, the file is not a holdings table,
  and saying so beats importing half of one.
- **The identity column is the one that is mostly unique**, after ISIN shape fails. This is
  what stops a `Region` column of `US` and `JP` — perfectly ticker-shaped — from being taken
  for tickers. A header hint (`Ticker`) is authoritative; uniqueness only breaks ties.
- **A bare ticker is not an identity.** In one global fund `SAN` was Santander and Sanofi,
  `MRK` was Merck & Co and Merck KGaA, `6526` was Socionext and Airoha — ninety collisions
  in one file. Identities carry their venue (`SAN.ES`), folded to ISO country codes so two
  issuers writing `US` and `United States` agree. Same principle as `IBE.MC` over `IBE`.
- **Rows with no usable identity fold into the residual** — cash, FX forwards, an issuer's
  own catch-all bucket. The residual can be **negative** when a fund carries negative cash;
  that is honest, not a bug, and clamping it would hide that the fund is geared.
- **`EtfHolding` is replace-only**, unlike append-only `PriceSnapshot`. A holdings file is a
  snapshot of what a fund holds today, not an event that happened; appending would keep
  constituents that have left the index.
- **Several detector thresholds scale with file size.** A column is rejected as "not
  categorical" above 90% distinct values, which is right for four thousand rows and
  meaningless for four. It self-limits — a tiny fund cannot have ticker collisions — but
  know it is there before trusting a small fixture.

## Canonical identity (OpenFIGI)

Issuers disagree on what to publish: some give an ISIN, some only a ticker, and they share
hundreds of companies. 726 collisions were measured across six real funds, which is why
manual aliasing was abandoned — 726 confirmations is not a system.

- **`shareClassFIGI` is the level to use.** It links one share class across countries, which
  is exactly the ISIN-versus-ticker gap. `compositeFIGI` only links venues within a country
  and leaves the gap open; the instrument-level `figi` is per listing.
- **Share classes are deliberately not merged.** GOOG/GOOGL, Berkshire A/B, Samsung ordinary
  and preferred are separate securities with separate ISINs and prices. FIGI does not join
  them either. Reporting them apart is correct, not untidy.
- **Tickers are sent without `exchCode`.** OpenFIGI speaks Bloomberg's exchange vocabulary,
  not ISO (Taiwan is `TT`, Germany `GR`, the UK `LN`). Every listing comes back and only
  unanimity resolves; on disagreement the venue decides first and the issuer's name second.
  `venues.ts` bridges ISO to Bloomberg — a table, accepted only because a wrong or missing
  entry costs nothing: it narrows an already-ambiguous set, so at worst it filters nothing.
- **Names are compared by containment, not equality**, because sources clip at different
  widths. Safe only because the match must be **unique** among candidates, and prefixes
  under 8 characters are refused so "Bank" cannot reach "Bank of America".
- **Refusing is the correct failure.** An unresolved leaf keeps its raw identity and still
  reports the right value; it simply does not merge. A wrong merge silently claims a holding
  that does not exist.
- **OpenFIGI v3 renamed the "not found" key from `error` to `warning`** (v2 shut down
  2026-07-01). Checking only `error` swallows every miss in silence.
- Resolution happens **at import**, is cached permanently including misses, and runs in
  **descending weight order** — unauthenticated the endpoint allows 10 jobs per request and
  25 requests a minute, so five thousand leaves is twenty minutes; ordering by weight means
  a couple of hundred lookups already cover every row that is drawn.

## Projections

- `computePositions` uses **AVCO** (weighted average cost) for the portfolio view.
  **FIFO** exists only for foral tax (`computeTaxLots`, future) and is a **separate**
  projection. Do not merge them.
- **Contributed ("aportado") = what left the bank, fees included.** One definition, shared
  by `computePositions.costBasis`, `computeCostBasisTimeline`, `computeReturns.totalInvested`
  and the XIRR cash flows. Rationale: the foral rule puts inherent costs inside the
  acquisition value, and excluding them flatters returns.
- **TWR excludes fees on purpose** — it uses price marks (`grossAmount / quantity`), and a
  fee is not a price. TWR = how the **asset** did. MWR/XIRR = how **my money** did. Their
  divergence under DCA is the point, not a bug.
- **`xirr` is one shared solver** (`projections/xirr.ts`), Newton-Raphson with bisection
  behind it. It returns `null` — never a stand-in number — for fewer than two flows, for
  flows that all carry the same sign (the IRR is undefined), and for non-convergence. The
  UI states the absence. `newtonRate` is exported only so a test can prove the fallback
  engages; it is not part of the projection surface.
- **A compounded TWR is unauditable as a scalar.** `explainPortfolioTwr` returns the chain
  link by link — denominator, flow, ratio — and `pnpm twr:explain` sorts them by distance
  from 1. Reach for it before believing or "fixing" a headline figure: the classic failure
  is a sub-period whose `startValue` is near zero, where a few euros of price movement
  become a large percentage that then multiplies every later link. Note the flow **is**
  subtracted (`(V_end − flow) / V_start`), so a sell-and-rebuy rotation does not inflate a
  link by itself, and the series is the **merged** portfolio, so a small denominator means
  the whole portfolio was small — usually at the head of the series.
- **An extreme link has two possible causes and they need opposite fixes.** A real move on a
  position of pennies is a denominator problem; a bad `PriceSnapshot` is a *data* problem,
  and a floor applied over it hides the symptom while the wrong price still feeds every
  valuation. `--around=<date>` prints each instrument's **implied price** (value ÷ quantity)
  at both ends plus the raw snapshots either side, flagging any close ≥2× the previous one.
  Check the magnitude before touching the projection — same trap as a venue line quoting
  5.5× the right one.
- **`computeRebalance` has no "surplus" phase and cannot have one.** The two-phase
  waterfall (fill the deficits, then spread the leftover by target weight) is a natural
  design and its second phase is unreachable: weights sum to 1, so `Σ ideal =
  totalValue + contribution` and `Σ (ideal − value) = contribution` exactly, while
  clamping each term at zero can only raise the sum. The total deficit is therefore
  always ≥ the contribution. A contribution big enough to fill every deficit is one
  that lands every line exactly on its ideal with nothing left over.
- **`computeProjection` simulates two pots and they never merge.** The planned pot
  takes the contributions at target weights; everything else held compounds at its own
  weights and is never funded. Applying the plan's return distribution to money sitting
  in something the plan does not name is the same error as pro-rating an `UNRESOLVED`
  leaf. Both pots advance on **the same drawn month index** — drawing separately would
  assume the two halves of the portfolio are independent and understate a bad month.
- **The plan fixes the bootstrap window; off-plan positions only qualify for it.** A
  held position either covers every month of that window or is reported with its value
  in `unsimulatedValue` and left out. Otherwise a purchase made last month would shrink
  the window the whole projection rests on. Set-aside value is **not** added flat to the
  percentiles either: freezing a real asset at 0% for twenty years is as false a claim
  as lending it the plan's returns.
- **Below `MIN_WINDOW_MONTHS` (60) the screen prints no number at all.** Same rule as a
  CPI hole disabling real mode. `projectionWindow` is exported precisely so the refusal
  can name the limiting instrument without simulating anything. Above the threshold,
  `impliedAnnualReturn` — the annualised drift of the sampled window — stays on screen:
  sixty months can still sit entirely inside one rally, and that number is what makes it
  visible. Do not "helpfully" downgrade the refusal to a warning.
- **Lowering `MIN_WINDOW_MONTHS` to see the other branch is a one-way trip if you forget.**
  No other test routes through the constant — each builds its own window — so a leftover
  `= 12` passes the entire suite while the refusal quietly stops refusing. A test pins the
  value at 60 for exactly that reason. If it fails, the question is whether the policy
  changed on purpose, never whether the assertion is in the way.
- **The projection loop is the one place floats are allowed.** It reports a guess, not a
  fact, and a Monte Carlo median quoted to the cent claims a precision the method lacks.
  `Money` still guards the boundaries. This is not licence to relax the money rules
  anywhere that reports what actually happened.
- **`computePortfolioReturns` is nominal even when the basis switch says real.** Its flows
  are the euros that left the bank, so deflating the value series without them would quote
  a real return against nominal money. The Resumen loader builds a second, un-deflated
  series for it. Portfolio TWR is **not** an average of the per-instrument TWRs — a return
  is not additive.
- Valuation is **EUR-base only, no FX**. Every mapped instrument quotes in EUR. A fund
  named "USD Acc" states the fund's *denomination* currency, not the currency of the line
  being bought — it needs no conversion.
- Positions without a usable price are excluded from **both** `totalValue` and
  `totalInvested`, and reported via `unpricedCount`. Adding a cost without its value
  invents a loss.
- The portfolio series merge carries each instrument's **last known value forward** across
  gaps. Without it, an instrument missing a datapoint on some date counts as 0 and opens a
  false valley.
- "Since inception" deltas come from `computePortfolioSummary` (`computeHeroChange`), not
  from subtracting the series endpoints: the series starts at the first purchase, when P&L
  already equals −fees, so subtracting endpoints returns the fees as a gain. Bounded ranges
  do measure against their own start (`computeRangeChange`), and measure the change in
  **unrealised P&L**, never in value — otherwise a contribution looks like a gain.

## Inflation and real returns

- **Real "aportado" is not the deflated total.** Every contribution entered with a
  different purchasing power, so each one is restated at **its own month** inside the AVCO
  fold and only then averaged. `walkAvco`, `computeCostBasisTimeline` and
  `computeInvestedVsValueSeries` all take an optional `Revalue` for exactly this; deflating
  the finished total applies one month's index to money that arrived across years and
  inflates real P&L. `computeInvestedVsValueSeries` restates **both** lines — invested at
  each contribution's date, value at each price mark's — because restating one turns plain
  inflation into a gap between them.
- **The month of a trade is Madrid's, never UTC's.** `periodOf` formats through `Intl` with
  an explicit `timeZone`. Spain is +1 in winter and +2 in summer, so the last hour(s) of
  every month are already the next month locally, by a different amount either side of the
  DST switch — a fixed offset does not fix it. Any test touching periods must include a
  month boundary in both March/October, or the bug is invisible.
- **INE's `Fecha` is a trap for the same reason.** It is epoch-ms anchored to Europe/Madrid,
  so April 2026 arrives as `1774994400000` = `2026-03-31T22:00Z`. The month is already in
  the payload as `Anyo` + `FK_Periodo`; `parseIneSeries` uses those and never `Fecha`.
- **Series ids are found, not guessed.** `TABLAS_OPERACION/IPC` → `SERIES_TABLA/24077`
  (national, one series) and `SERIES_TABLA/24081` (provincial, 53). National general is
  `IPC290751`, Bizkaia `IPC308320`. `DATOS_SERIE/{COD}?nult=1000` returns the whole series
  (295 months from 2002-01). A period with no data is simply absent — never an error, never
  a zero, so gap detection is entirely ours.
- **`InflationIndex` rows carry their `base`, unlike `PriceSnapshot`.** A past price is a
  fact that never changes; a past index level is republished at a new reference year every
  few years. Append-only alone would keep the old levels beside the new ones and every
  ratio spanning the boundary would be wrong, in the flattering direction. `ipc:sync`
  refuses on a base change and prints `--force-rebase`, which replaces the series wholesale;
  `InflationIndex.from` throws on a mixed-base set.
- **The base year is derived, not stored twice.** It is by definition the year whose twelve
  months average 100 (`deriveBaseYear`, tolerance 0.05 — measured error 0.0002, nearest
  other year ~2.5 away). No single qualifying year means refuse, not guess.
- **The reference month is the last one published, and it lags.** INE publishes month M in
  mid-M+1, so amounts are restated into `to = latestPeriod()` while market value stays at
  today's price. That few-week residual is stated on screen, not absorbed. A flow **later**
  than the reference is left nominal (nobody has measured that month); a flow **earlier**
  than it with no level is a hole, and a hole disables real mode for the whole view and
  names the months. Same rule as `UNRESOLVED` and a missing candle: reported, never spread.
- **`latestPeriod()` and `lastSyncedAt` are different questions and both are shown.**
  `latestPeriod()` is the newest month INE has published — what the euros on screen *mean*.
  `lastSyncedAt` is when we last asked — whether anybody has checked for a newer one. A
  fresh sync of a month-old index is normal; a stale sync of the same index is not, and one
  timestamp cannot say which is the case. Do not collapse them into "updated".
- `real.server.ts` is deliberately **not** exported from `app/lib/index.ts` — that barrel is
  what components import, and it would pull Prisma into the client bundle.

## Portfolio target (the savings plan)

- **Versions are resolved by `activeFrom`, never by `createdAt`.** `getActiveTarget(targets,
  asOf)` picks the latest `activeFrom <= asOf` — the same rule that makes `latest()` order
  prices by `asOf`. A plan recorded late belongs to the past it was written for. `createdAt`
  breaks an exact `activeFrom` tie and nothing else.
- **A target is never edited in place.** The repository exposes `create` / `list` / `remove`
  and no update: changing the plan records the next version, so "what was I aiming at in
  March" stays answerable. Reusing an id fails, deliberately.
- **The amount is stored, the weight is derived.** The plan is written in euros per month,
  so euros are the fact and `deriveTargetWeights` is a view of them. Storing both is the
  same mistake as storing `leafTotal`. Deriving the other way round — weights times a total
  — silently rewrites every line the day the total changes.
- **`PortfolioTargetLine.instrumentId` has no foreign key on purpose.** A plan can name
  something never bought, which has no `Instrument` row until the first import. Such a line
  keeps its full weight; dropping it would overstate every other line.
- **The join is exact id equality at read time, so a mistyped id is a ghost line.** It is
  indistinguishable from "not bought yet" and stays that way forever. `findIdMismatches`
  refuses a plan whose id differs from an imported one only in case (CLI and screen both),
  while an id resembling nothing imported is accepted with a warning — that one is the
  feature. Ids are compared, never rewritten: ingestion stores the broker's `symbol`
  verbatim, so normalising here would only move the mismatch.
- One line per instrument per version (`@@unique([targetId, instrumentId])`) — two would
  split that instrument's weight in half without saying so.

## Fiscal

Always the **Bizkaia foral regime** (Norma Foral de IRPF de Bizkaia). Never régimen común.

## Kraken rewards

- **A reward is an acquisition with no counter-leg**, so its value comes from the price
  history at the moment of receipt, injected as `PriceAt` — `mapGroup` stays pure and never
  fetches. Zero cost hid the income *and* inflated every future realised gain by the whole
  value of the units.
- **No price for that day means discard (`reward-unpriced`), never zero.** A discard is
  counted and printed; a zero is a wrong number that looks like data. Fix by running
  `prices:backfill` and importing again — dedup by `refid` makes re-import safe.
- **The lookup never reaches forward.** `priceLookupFrom` takes the last close at or before
  the timestamp, within 7 days; a later candle is information that did not exist yet.
- Scope is still BTC-only by choice (`isBtc` in `map.ts`). Measured on a real export:
  87% of refid groups are discarded as `non-btc` — SOL and ETH `earn`, plus `welcomebonus`
  in five assets. `pnpm ingest` prints the count under one label, so the breakdown by asset
  is not visible from the summary.

## Ledger entry types

`LedgerEntry.type` is constrained at the database to exactly what `ledgerEventSchema`
models: `BUY | SELL | DIVIDEND | DEPOSIT | WITHDRAWAL | INTEREST`. Adding a type means
adding it in **both** places, in the same change.

- **A row the database accepts but the domain refuses is a delayed outage.** `rowToEvent`
  throws on an unknown type, and `list()` maps every row, so one bad row takes down every
  screen that reads the ledger — far from the insert that caused it. One seeded `FEE` row
  did exactly that.
- **No broker emits a fee event.** Trade Republic reports fees as a column on the trade and
  Kraken as `fee` on the ledger row, which is why `fees` and `taxWithheld` are columns.
  `FEE`, `TAX_WITHHOLDING` and `SPLIT` were advertised in the schema comment for months and
  never modelled anywhere.
- **The CHECK lives only in migration SQL** — Prisma cannot express it in `schema.prisma`
  for SQLite. A future migration that rebuilds `LedgerEntry` (SQLite rebuilds the table for
  most column changes) will silently drop it. Re-add it in that migration.

## CSV ingestion

papaparse behaves differently under ESM/tsx than under CJS. **Both** guards are required
and are applied defensively to every adapter:

1. `skipEmptyLines: 'greedy'`
2. a pre-validation filter dropping any row without a `type` field

Append is idempotent: dedup by `source` + `externalId`.

## URL as state

Sort order (Cartera), chart range (Resumen), page (Movimientos), concentration threshold
(Asignación, `?umbral=20`) and the rebalance inputs (Asignación, `?aportacion=500`,
`?desvio=2`) live in **URL search params**, written by the UI and read by the **loader**.

A `<Form method="get">` **rewrites the whole query string** from its own fields, so any
param already in the URL that is not a field of that form is dropped on submit. A GET
form therefore re-emits every param it does not own as a hidden input — **all of them,
read from the URL, never a hand-kept list** (`carriedParams`). The list version is not
a smaller version of this: it works until someone adds a param elsewhere on the page and
never thinks about that form, which is exactly how submitting the rebalance split started
throwing the user back to the exposure tab. No context, no state lifting, and the view stays
shareable. A route opts into the header's range selector with `handle = { range: true }`;
`handle.title` sets the header title.

## Tailwind v4 — a nonexistent class is silent

`bg-surface-1` and `text-warning` do not exist in this theme. Tailwind emits nothing for an
unknown token and raises nothing, so **typecheck, lint and build all pass** and the element
simply renders unstyled. Check `app/app.css` for the real tokens before inventing one:
`--color-bg`, `--color-surface`, `--color-surface-2`, `--color-border`, `--color-text`,
`--color-muted`, `--color-positive`, `--color-negative`, `--color-dn-1..5`.

`dn-1..5` is a **greyscale ramp**, not a categorical palette. The design is monochrome and
green/red are reserved as semantic signals — a category is not a warning.

Also declare `color-scheme` when adding native controls: a `<select>` popup is drawn by the
OS, and without it the panel comes back light while the options inherit white text.

## Testing

Vitest. Everything pure is tested: `Money`, domain, projections, parsers, mappers, and
ingestion against injected fake repositories. `test:integration` runs `prisma migrate
deploy` against a temporary SQLite database.

A regression only counts as fixed when a test covers it. The fee-treatment bug survived
for months because **no test used `fees ≠ 0`**.

CI (GitHub Actions) runs lint + typecheck + build + test on every push and PR. All four
must pass.

## Workflow

- Branches `feat/*`, `fix/*`, `chore/*` cut from `develop`. PRs target `develop`.
  (`feature/*` is the older prefix, still on the merged branches; match the commit type.)
  `main` is untouched until a release.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`).
- `CHANGELOG.md` follows Keep a Changelog, with an `[Unreleased]` section.
- **The version lives in `package.json`.** Bump it with `pnpm version <patch|minor|major>`,
  which writes the field, commits and tags. It is stated in **three** places — that field,
  the `CHANGELOG.md` heading and the README status line — and nothing links them, so a
  release edits all three or the repo starts disagreeing with itself.
- No "Known limitations" sections in docs — open a GitHub issue instead.

## Working agreement

- Direct, critical feedback over validation. Push back when something is wrong; do not
  agree to be agreeable.
- **Product decisions belong to Aritz. Architectural ordering is the agent's to propose.**
- Reusable components and logic, built with scale in mind.

## Maintaining this file

This file is injected into **every** context, so it carries only what changes what an agent
**does**: commands, invariants, conventions, and traps that cannot be deduced from reading
the code. History and roadmap live in `CHANGELOG.md` and GitHub issues — duplicating them
here guarantees drift, and a stale CLAUDE.md is worse than none.

Do not run `/init` over this file: it would overwrite exactly the traps above, which are
the part no tool can regenerate.
