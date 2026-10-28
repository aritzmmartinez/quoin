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
- UI: **Spanish by default, English as a full second locale.** `Locale` is `es | en`
  (`app/lib/locale.ts`), stored in the `quoin-locale` cookie, parsed once in the `root`
  loader. Never hardcode a user-facing string in a component.
- **Copy lives in `app/lib/i18n/`** — `es.ts`, `en.ts`, `index.ts`. Components read it
  with `useCopy()`; everything else (pure helpers, loaders, actions, `*.server.ts`)
  takes a `Copy` argument. Route `meta` uses `copyFromMatches(matches)`.
- Formatting goes through `useFormat()` in a component, `createFormat(locale, zone)` anywhere
  else (`formatMoney`, `formatQuantity`, `formatSignedMoney`, `formatPercent`,
  `formatCalendarDate`, `formatInstant`, `formatPeriod`, `formatTimeTick`, `formatRelativeTime`, `formatClock`).
  **Never call `Intl` or `toLocaleString` from a component**, and never reintroduce a
  free `formatMoney`: the whole point of the factory is that no code path can format
  without saying which locale it means.
- The zone a formatter shows instants in is the **display zone**; it arrives from the root
  loader (`useZones()`), never from inside the formatter. **A day and an instant are two
  functions, chosen by what the value is, never by the shape of the string:**
  `formatCalendarDate` takes a `YYYY-MM-DD` (it has no zone, is never shifted into one,
  and throws on anything else); `formatInstant` takes an ISO instant or epoch ms and shows
  its day in the display zone. `activeFrom`, a rate day, a closing day and the repurchase
  window's end are days; a trade's `ts`, a price's `asOf` and a check time are instants.
- Note on es-ES: CLDR `min2` means 4-digit numbers carry **no** thousands separator
  (`1234,56 €`). This is correct output, not a bug. English is **en-GB**, not en-US:
  the app is euro-denominated and day-first, so `€1,234.56` and `14/09/2026` are the
  pair that matches what the Spanish side shows.

## Commands

```
pnpm dev                          # dev server
pnpm build                        # production build
pnpm typecheck                    # tsc
pnpm lint                         # eslint
pnpm test                         # vitest, unit
pnpm test:watch
pnpm test:integration             # migrate deploy against a temp sqlite db
pnpm verify                       # lint + typecheck + build + test (the four unit-level checks)
pnpm verify:full                  # verify + test:integration — the full CI gate, run before a tag
pnpm db:generate                  # prisma generate
pnpm db:migrate                   # prisma migrate dev — development only, refuses the ledger
pnpm db:deploy                    # prisma migrate deploy — backs up the ledger first if pending
pnpm db:studio
pnpm db:backup                    # VACUUM INTO data/backups/, keeps the last 30
pnpm db:seed [--anchor=YYYY-MM-DD]   # synthetic portfolio into the scratch database
pnpm ingest --broker=<trade-republic|kraken> <file>
pnpm prices:sync                  # fill daily gaps, then quote every mapped instrument
pnpm prices:map <ISIN> <SYMBOL> [range]   # set a Yahoo symbol and replace the history; show / --clear
pnpm prices:backfill [ISIN] [1y|2y|5y|10y|max]   # daily history, default 5y
pnpm prices:rebuild [ISIN]        # replace every mapped history, one at a time
pnpm exposure:map                 # list how every instrument resolves
pnpm exposure:map <ISIN> <KIND> [LEAF]           # e.g. XS00TEST0003 COMMODITY XAU
pnpm identity:resolve [--limit N] [--all] [--retry-ambiguous] [--refresh] [--report]
pnpm ipc:sync [--force-rebase]        # INE consumer price index, national + Bizkaia
pnpm fx:sync [CODE…]                  # ECB reference rates; default: every non-EUR currency in use
pnpm target:set                       # show the savings-plan target in force today
pnpm target:set <file> [--from=YYYY-MM-DD] [--name=…] [--note=…]   # record a version
pnpm projection:converge              # seed-to-seed spread of p10/p50/p90 at several N
pnpm projection:converge [--sims=1000,3000] [--seeds=8] [--horizon=240] [--contribution=…]
pnpm twr:explain [--top=N]            # print the portfolio TWR chain, worst link first
pnpm twr:explain --around=YYYY-MM-DD  # open one link: holdings and implied prices at both ends
pnpm tax:explain [YYYY|--year=YYYY]   # replay the Bizkaia foral FIFO, lot by lot
pnpm sync:export <file>.quoin.json    # whole user state of DATABASE_URL, for another device
pnpm sync:import <file> [--dry-run]   # merge an export into DATABASE_URL; backs the ledger up first
```

Fund compositions have **no command**: the CSV is dropped onto the fund's row in
`/instruments`. That was a deliberate product decision — one more command is one more
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

- **core** — domain and pure projections. No Prisma, no `fetch`, no I/O, no clock: `now`
  is a parameter with no default, like the zone.
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

## Calendar and zones

Which day, month or fiscal year an instant belongs to is decided in **`core/calendar`
and nowhere else**: `dayOf`, `periodOf`, `fiscalYearOf`, `today(zone, now)`,
`startOfDay`. Every one takes the zone as a parameter with no default. It is the first
piece of the contract with the mobile client, which must assign the same days.

- **The zone comes from the residence setting, resolved in one place.** `Settings` has
  one row (`CHECK id = 1`); `residence` (today only `bizkaia`) has no CHECK — the
  vocabulary grows, `residenceSchema` validates at write and at read. Core maps it two
  ways, `territoryOfResidence` and `zoneOfResidence`, and they are separate because the
  régimen común will be one territory in two zones (Canarias). `loadResidence()` is the
  server's only reader: it yields the `Jurisdiction` (territory + zone, what AVCO, FIFO
  and the swap rule take), the **calendar zone** and the **display zone** — the same zone
  today, two decisions. The root loader hands both to the client.
- **`toCalendarDate` caches by `(zone, UTC minute)`, bounded LRU, from 1980.** Not by
  quarter-hour: offsets since 1980 are multiples of 15 minutes, but Goose Bay and St
  John's switched at 00:01 local until 2011 and Casey did in 2020–2022, so one UTC
  quarter-hour can hold two local days. Measured over every IANA zone; a test pins the
  Goose Bay case.
- **Nothing reads the process's zone.** ESLint (`LOCAL_TIME` in `eslint.config.js`)
  refuses local getters and setters, `new Date(y, m, d…)` and an `Intl.DateTimeFormat`
  without `timeZone`, outside `core/calendar`. The one exception is `backup-names.ts`: a
  file name is read by a person on their own clock. Both vitest configs set
  `TZ=Pacific/Kiritimati` (UTC+14) through `test.env`, which works on Windows, where a
  `TZ=` set from Git Bash never reaches Node; a test pins it.
- **An instant from outside carries its offset.** Trade Republic's `datetime` must have
  `Z` or an offset (`z.iso.datetime({ offset: true })`); without one `new Date` reads
  the process's zone and the same row is two instants in Docker and in Madrid. Kraken's
  `time` has none and is UTC by definition (`parseTime` appends `Z`).
- **Golden cases live in `test/contract/*.json`**, read through `loadContract(name,
  schema)`. `sync.json` is written by `test/contract/sync-contract.ts`
  (`pnpm tsx test/contract/sync-contract.ts`), its expectations by hand, never by
  running `merge`; a test fails while the two disagree. They are shared with the mobile client: change a case only together with the
  implementation that reproduces it on both sides.

## A command's logic never lives in its script

Every CLI action that also has a button in the app lives in `app/lib/<name>.ts`, and the
script under `scripts/` only parses argv and formats what the function returns:
`syncPrices`, `syncInflation`, `backfillInstrument` / `backfillInstruments`,
`replaceQuoteHistory` / `replaceQuoteHistories`. Adding behaviour to the script gives it to the CLI and silently
**not** to the route (`api/prices/sync`, `api/ipc/sync`), and the two then disagree about
what a sync did — the counts on screen are the ones the function returns, not the ones the
script printed. `api/ingest` is the exception and is allowed to be: `scripts/ingest.ts`
and `ingest.server.ts` drive the same adapters but answer different questions (a whole
file at once vs. a preview, a commit and two follow-up steps).

- **The pure module and its wiring are two files, and the barrel carries only the pure
  one.** `app/lib/x.ts` takes injected repositories and providers (so it is unit-testable
  with fakes); `app/lib/x.server.ts` builds them from Prisma and the real provider. **No
  `*.server.ts` is exported from `app/lib/index.ts`** — that barrel is what components
  import, and one such export pulls Prisma into the client bundle. That exclusion covers
  every `*.server.ts` file, including `real.server.ts`, `rate-book.server.ts` and
  `version.server.ts`, which have no pure half at all; it is the rule, not a special case
  for any one of them.
- **A destructive option stays CLI-only.** `ipc:sync --force-rebase` replaces a series
  wholesale, so `scripts/ipc-sync.ts` owns the flag and `syncInflation` cannot rebase at
  all: it *reports* `rebaseBlocked`, and the endpoint names the affected series without
  acting. A button is one click; a flag is a decision. Same reasoning as `db-guard`.
  Replacing an instrument's price history **is** on a button, and that is not an
  exception: it downloads before it deletes, refuses when nothing arrives, and can be
  repeated to the same result. What is gone is a re-downloadable cache, never the ledger.
  `prices:map --clear`, which drops prices with nothing to replace them, stays CLI-only.

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
- **An unknown symbol is an empty answer; an unanswered request throws.** The provider
  returns `null` / `[]` for a 200 without data and for Yahoo's "no such symbol" — a 404
  with `chart.error.code: "Not Found"`, measured 2026-10-18. Any other status (400, 401,
  403, 429, 5xx), a network failure or a body that is not JSON throws
  `MarketDataUnavailableError`, carrying the status or the cause. Swallowing those, as the
  provider once did, turns a rate limit into "this symbol has no history" and refuses a
  good symbol. Callers keep going past one: sync reports `unavailable`, the wizard's fill
  and "Rebuild all histories" carry on and name it, `api/ingest` answers 503 and logs it.
  The port is `getQuote(symbol)`, one symbol, because no caller ever asked for two.
- **Every request to a provider goes through `withTimeout` in `adapters/http`**, which
  bounds the whole request, body included, and fails it as that provider's unavailable
  error with the `TimeoutError` as `cause`. Each adapter has its own constant, set from a
  measurement made on 2026-10-21: Yahoo 15 s (a `max` history 0.46–0.88 s), INE 20 s
  (0.24–0.58 s), ECB 60 s (41–52 s for the whole history), OpenFIGI 30 s for ten jobs
  (7.4–8.6 s for ten large-cap ISINs) and 120 s for a hundred, which is extrapolated: no
  key was used to measure it. The timer is a `setTimeout`, not `AbortSignal.timeout`, so
  fake timers control it. It also takes an outside signal; no port carries one yet.
- **`range=max` is not daily, whatever `interval` says.** Measured 2026-10-08: Yahoo
  answers `interval=1d&range=max` with monthly candles for a crypto pair and weekly ones
  for an ETF, each dated at the start of its period but carrying the period's last close — a
  price from weeks later, which the 7-day reward lookup and every chart then read as that
  day's. `1y`…`10y` came back daily. `historyUrl` therefore never sends `range=`: it
  converts every range into `period1`/`period2` (`max` from the epoch) with `interval=1d`,
  which returns daily candles for the whole history. Do not reintroduce `range=`.
- `prices:backfill` deliberately does **not** apply that filter. Discarding old quotes is
  correct for "what is this worth now" and wrong for "what was this worth then".
- `backfill` issues **sequential** requests (the chart endpoint is unofficial and
  rate-limits) and drops sessions without a close rather than interpolating.
- **A backfill does not necessarily cover today, so a fresh mapping needs both steps.**
  Yahoo consolidates the newest daily candle late: for hours after a session closes,
  `range=` still returns it with `close: null`, and the parser drops it rather than
  interpolate. Measured on three ETFs on two exchanges at 22:20Z on a Saturday — the
  Friday candle was null; ten minutes later the same request had it filled. Crypto is
  unaffected (24/7, no consolidation gap), which is why testing this on `BTC-EUR` shows
  nothing. `prices:sync` is what closes the gap, writing the live session from
  `regularMarketPrice`. The two never collide: different `asOf` (session open vs. market
  timestamp), so `@@unique([instrumentId, asOf])` keeps both and `latest()` resolves the
  sync's. Run backfill first and sync second — the requirement is that **both** run;
  ending on the sync just means the last row written is also the newest in time.
- `PriceSnapshot` is idempotent via `@@unique([instrumentId, asOf])`.
- **"The last value at or before" is one function: `lastOnOrBefore` in `core/series`**,
  with `atOrBefore` (instants) and `onOrBeforeDay` (Madrid days) over it. The caller
  sets the maximum age; the series must be ascending by its key, and an unsorted one
  returns a wrong value without an error. Kraken rewards, the symbol check and the
  opportunity cost go through it; write a new lookup through it, never as a fresh loop.
  The sweeps that carry a last value forward (`computeInvestedVsValueSeries`, the
  portfolio merge) are not lookups and stay as they are.
- **A sync fills gaps, then writes at most one live row per Madrid day.** `prices:sync` and
  "Refresh prices" share `syncInstrumentPrices`, one instrument at a time (`inTurn` on the
  client, as "Rebuild all"). It asks Yahoo for daily candles from the Madrid day of the
  instrument's newest row, **whatever its source**, minus `SYNC_OVERLAP_DAYS` (7), through
  yesterday; today's candle is dropped because it has not closed. Then the live quote,
  stored as `YAHOO_LIVE` (`liveSource`) and dated by **its own** `regularMarketTime`, never
  by the clock — on a Saturday it is Friday's close and belongs to Friday. The overlap is
  what heals rows written before `YAHOO_LIVE` existed: they cannot be told apart from
  candles, and nothing tries to.
- **A sync stops on a failure that is not the provider's.** `haltsSync`: anything but
  `MarketDataUnavailableError` (the database, a bug) is common to every instrument, so
  `syncInTurn` (Refresh prices and its row in External data), the wizard's price step
  and `prices:sync` stop there and say it once with the cause, instead of listing every
  instrument as an error. `syncInstrumentPrices` records a `PriceSync` check once Yahoo
  has answered, which is what External data shows as the last update.
- **Once a day has its candle, that candle is the day's only row** (`planDailyWrite`, applied
  by `PriceRepository.saveDaily` in one transaction). Any other row that Madrid day is
  deleted by id, `YAHOO` or `YAHOO_LIVE`; a candle on an `asOf` already stored updates it.
  Each candle is *inserted* (its day had no candle, even if a live or old `YAHOO` row is
  replaced), *corrected* (same `asOf`, new price) or *unchanged* (not written). Only
  inserted ones are "recovered" on screen: the overlap re-reads a week every time, so a
  count of candles written would claim recoveries on every click.
- **A candle Yahoo has not consolidated arrives dated correctly with `close: null`**, and
  the parser drops it. Measured 2026-10-15 at 10:20Z: two ETFs still had a null 14/10
  candle, a stock on the same exchange as one of them had it. The day keeps its live row until a
  later sync inside the overlap window finds the close — not a filter bug.
  A live quote is not written on a day that has a candle, and replaces the day's earlier
  live row. `latest()` never returns to an **earlier day**; within one day it may move from
  the live row's time back to the session open, because the close it carries is newer
  information. "Day" is `dayOf` in `core/calendar`, in the calendar zone, like `periodOf`.
- **Deleting an instrument's snapshots happens in two places, both atomic:** `saveDaily`
  above, and `PriceRepository.replaceHistory`. One transaction deletes the
  instrument's rows (all of them, or only those at or before `keepAfter`), writes the new
  ones and, if asked, sets `quoteSymbol`. A failed write rolls back the delete and the
  symbol together — an integration test pins that. Two symbols' prices must never share
  a series, so a symbol change only ever goes through it.
- **`replaceQuoteHistory` fetches everything before it writes anything.** Daily candles
  first; none returns a failure and touches nothing — a failed Yahoo call must leave the
  old series intact. Then the rates of the history's currency, from its first day
  (`ensureRates`): a currency the ECB publishes nothing for fails as `no-rate-series`, an
  ECB that does not answer as `rates-unavailable`, and neither writes. Then today's quote,
  kept only if fresh, in the history's own currency and newer than the last candle,
  because the newest daily candle can arrive without a close. If that quote is missing and the symbol is unchanged, rows newer than the last
  candle are kept (`keepAfter`), so `latest()` never moves back. On a symbol change it
  may: the old rows belong to another security.
- **A rate is used two ways, and `core/fx/rates.ts` keeps them apart.** `bookingRate`
  books a ledger row: the rate of its own TARGET day (`rateDayFor`, a weekend or closing
  day falls back to the last business day) or nothing, never an older one, because a
  booked amount is frozen. `valuationRate` values a price: the last rate published on or
  before the day, at most `VALUATION_RATE_MAX_AGE_DAYS` (7) old, because the day's rate
  appears around 16:00 and the longest closure (Easter) is under a week. Today's value and
  every past close go through the same `valuationRate`; today is just `day = today`.
- **Prices reach euros in one place: `pricesInBase` / `historyInBase` in `core/fx`.** A
  price with no rate within the week is left out and reported in `unrated`, the
  `unpricedCount` rule. `computeMarketValues` and `computeOpportunityCost` throw on a
  price that is not in euros instead of reading it as unpriced, so a loader that skipped
  the conversion fails loudly. Loaders read prices through `loadValuation`
  (`rate-book.server.ts`), and `UnratedNotice` names the open positions left out.
- **The write paths refuse only a currency with no ECB series.** `ensureRates` syncs a
  currency from the day it is needed and `rateSeriesOf` tells base, published, none and
  unavailable apart, so an ECB outage is never read as "no rates". Assigning, replacing,
  backfilling and the symbol check go through it; `syncInstrumentPrices` writes a foreign
  history as it arrives. Write any new check through `rateSeriesOf`, never as a literal
  `"EUR"`.
- **The wizard's `map` only assigns; it cannot replace.** `assignQuoteSymbol` refuses an
  instrument that already has prices and the endpoint sends the user to Instruments.
  Changing a symbol is the `replace` intent, which carries the range and goes through
  `replaceQuoteHistory` — the same function as "Download the history again", "Rebuild all
  histories", `prices:map` and `prices:rebuild`.
- **The default range never shortens what is stored.** `rangeSince(earliest, now)` is the
  wider of `DEFAULT_HISTORY_RANGE` and the range covering the oldest stored row;
  `lostHistoryBefore` names the date a narrower choice would drop, and the screen says it
  before confirming.
- **Coarse candles are detected by gaps only** (`isCoarseSeries`): more than half the gaps
  ≥6 days, or three ≥6-day gaps in a row. Two rows on one Madrid day is **not** a signal:
  a live quote beside that day's candle produces exactly that, and Yahoo's weekly candle
  (Monday 00:00 exchange time, measured on an ETF) looks the same. Undetectable cases
  exist — a monthly BTC candle that overwrote the day-1 daily one leaves a perfectly daily
  series — so "Rebuild all histories" is always offered and no text claims a history is
  clean.

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
   for code in this repo. It is an **allow-list of exactly one path**,
   `SCRATCH_DATABASE_FILE` = `data/dev.sqlite`. Any other target is refused, including
   `data/showcase.sqlite`. "Not the ledger" would wave through `data/quoin.sqlite.bak`, a
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
- **Every script that opens the database calls `announceDatabase()` first**, on stderr:
  the file, and whether it is the ledger, scratch or neither. It is information, not a
  fourth defence — `pnpm db:deploy` once went to the ledger while it was believed to go to
  `dev.sqlite`, and nothing said so. A new script that opens the database calls it too.
  `scripts/db-which.ts` does it for Prisma's own commands: `deploy` backs the ledger up
  first when `migrate status` is non-zero (the entrypoint's rule, through the same
  `backupDatabase` as `db:backup`), `migrate` refuses the ledger. It spawns Prisma as
  `node_modules/prisma/build/index.js` under `process.execPath`, never through a shell:
  the checkout path has a space in it.
- The seed is **synthetic and stays synthetic** — same reason fixtures are (see *Privacy*).
  It encodes the shapes that have caused bugs: `fees ≠ 0`, an unpriced position, a fund
  with no holdings, two funds sharing constituents, a partial sell.
- **`db:seed:showcase` does not exist, and `data/showcase.sqlite` is what it left behind.**
  The command was written locally, documented in the v0.8.0 docs pass, and deleted without
  ever being committed — git has no trace of it, there is no `package.json` entry, and the
  guard above refuses that path anyway. The `.sqlite` file survives, gitignored, carrying a
  full schema. Treat it as an artefact with no producer: nothing regenerates it, so
  whatever it holds cannot be rebuilt from this repo.
- **If the command is rebuilt, it needs four things in the same change** — the script, a
  `showcase` wrapper, `SCRATCH_DATABASE_FILE` widened to a list (it is a single path
  today), and a test pinning that the new file passes the guard while every other path is
  still refused. It must set `DATABASE_URL` from a constant before the guard runs, so a
  screenshot session is never one stale variable away from the ledger.

## Sync

Two installations (and, next, the mobile app) merge by exchanging **whole user states**,
never operation logs. `core/sync` holds what the mobile client reproduces in Dart: the
format (`exchange.ts`, `schemaVersion: 1`, Zod both ways) and `merge(local, incoming)`,
pure. `app/lib/sync.ts` runs it over `PrismaSyncRepository`; the scripts only parse and print.

- **A mark is `<ms 15>-<counter 4>-<deviceId>`** (`core/sync/hlc`), issued by `stamp(tx)`
  inside the transaction of the write and never earlier than `SyncDevice.lastHlc`. A write
  that changes nothing issues none: `/instruments` calls every setter on every save, and an
  undated composition dropped again would otherwise move to today.
- **A mark is compared only with what each side has seen of the device that wrote it**,
  never with another clock: news to me if its origin is not me and it is newer than my
  `SyncPeer.seen`; news to the sender likewise against the peers list in the file. A taken
  value keeps its origin's mark — restamping it locally makes the next exchange an echo
  conflict. Both new, or neither new with different values (two NULL marks), is a conflict.
- **Copying the `.sqlite` copies `SyncDevice.deviceId`**, and an import refuses a file
  carrying its own id. Restore a backup on another machine and it is the same device.
- **A conflict writes nothing.** Apply is one transaction, seen marks included; effects
  (download a new symbol's history, sync a new currency's rates) run after it and a failed
  one is reported with exit ≠ 0, never rolled back: what it fetches is a cache. A patch that
  carries `quoteSymbol` deletes that instrument's prices in the apply transaction, so two
  symbols never share a series even if the download fails.
- **A file that brings no data takes no backup.** `sync:import` says "Already up to
  date" and writes only the seen marks, and only if they moved: the backup window holds 30
  and the mobile app syncs often. The marks still matter — a stale `seen` lets an equal
  value with a newer mark read as news, and the next local change becomes a false conflict.
- **The ledger has no marks.** Union by `(source, externalId)` — which is why
  `ledgerEventWriteSchema` refuses an entry without an `externalId` and the migration gave
  every old one `local:<id>`. `funding` only moves CASH → IN_KIND; any other difference is a
  conflict, including a Kraken reward valued from two different price histories.
- **A composition is one `EtfHoldingBlock`**, the only place its day lives. `asOfInferred`
  means the file stated no unambiguous date and the day is the drop's; between two blocks
  changed on both sides only a day read from a file decides.
- **`schemaVersion` is bumped for anything a v1 reader would misread**, e.g. deleting a
  composition, which today has no caller and so no tombstone.

## Privacy and the no-clobber rule

`Instrument.quoteSymbol`, `exposureKind`, `exposureLeafId`, `ter`, `hedgedToBase` and
`thesis` are set by CLI or the instruments screen and live **only** in the local,
gitignored SQLite database. Never commit symbols, ISINs, quantities, holdings or broker
exports — this repo is public and that data would publish the author's portfolio.
`*.csv` is gitignored, and so is `*.quoin.json`, the only name `sync:export` writes.

**Test fixtures are synthetic, always.** This bites in a non-obvious place: the set of funds
whose compositions get imported *is* the portfolio. A parser test using the real Vanguard
and Amundi exports would disclose which funds are held, as surely as committing a
`quoteSymbol` would. Copy the shape, invent the data.

The shape of a real `.xlsx` is in `test/fixtures/holdings/issuer.xlsx`, written as raw
OOXML by `issuer-xlsx.ts` beside it, not by SheetJS: a fixture the reader also wrote
proves only that it agrees with itself. Real exports go in `data/fixtures/holdings/`,
gitignored, where `xlsx.exports.test.ts` reads them locally and skips under `CI`. It
names a file by position only — keep it that way: a file name, a sheet name or a
holding in a failure message discloses the fund as surely as committing the file.
`*.xlsx` is gitignored except under `test/fixtures/`.

Ingestion must never write those columns. This is enforced by the type, not by
convention — `InstrumentWriteData` is `Omit<InstrumentRow, "quoteSymbol" | "exposureKind" |
"exposureLeafId" | "ter" | "hedgedToBase" | "thesis">`. Ingestion upserts **every**
instrument on **every** import, so any column it can write is a column it will eventually
overwrite. If you widen that type, a re-import silently destroys hand-set mappings.

**`Instrument.thesis` is CHECK-constrained in the migration, unlike the columns beside
it.** It is the only one of them the UI writes as an enum, and `rowToInstrument` throws on
a value the domain cannot read while `list()` maps every row — so an unexpected string
inserts cleanly and then takes down every screen that lists instruments, far from the write
that caused it. Same failure mode as `LedgerEntry.type`, same defence.

## Yahoo symbol mapping traps

An ISIN trades on many venues. Map a **venue line**, never the ISIN itself, prefer the
one in euros when there is one (a line in another currency is valued at the ECB rate, and
picks up that currency's moves), and always sanity-check the price magnitude.

- **Never map an ISIN as a `quoteSymbol`** (e.g. `XS00TEST0003.SG`). Yahoo resolves the
  ISIN to a quote, but has no historical series under that key — `timestamps` and `closes`
  come back `null` and `backfill` returns 0 candles. Use the venue ticker. **The symbol
  check refuses it**: no daily candle within `DAILY_HISTORY_PROBE` (1y — `max` would
  download a good symbol's whole history to check it) means `dailyHistory: false`,
  `canSave` refuses and `assignQuoteSymbol` refuses `no-history` on the server. Nothing
  in Quoin ever proposed `.SG`; the wizard's field starts empty. Instruments flags a
  symbol already stored with no candle through `dailyHistoryIds`, which skips
  `YAHOO_LIVE` rows. `historyStart` counts them on purpose: `SymbolPanel` reads it to
  choose between assigning and replacing, and `assignQuoteSymbol` refuses any instrument
  with a price.
- **Verify the price magnitude, not just the currency.** Several symbols quote in the
  expected currency yet are a different fund tracking the same index, or the same
  fund with a different entitlement per certificate — observed at 5.5x, 0.5x and 0.4x the
  correct line. Check the candidate price against the broker's own `amount / quantity` for
  a real trade before committing the mapping.
- **The symbol check does that comparison itself** (`checkQuoteAgainstLedger`): the last
  three trades of the instrument that have a rate, at their euro amount (`baseOf`) over
  the quantity, against the last close at or before each trade, within a week, never a
  later one, converted at the booking rate of the trade's own day; a day with no rate is
  skipped, never compared across currencies. It downloads only that date
  span. The warning is on the **median** deviation above 10%, so one odd fill does not
  trip it while a 0.4x or 5.5x line always does. Kraken reward buys are excluded: they
  were valued from a price history, so comparing them with one proves nothing.

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
- A leaf's total and weight are computed once, in withLeafTotals, and carried
  on the leaf; computeExposures is the only producer. The sort,
  summarizeExposures, toExposureRows and tailOf read total/weight and never
  call leafTotal/leafWeight. Those two remain the definition, and a test pins
  the carried fields to them. Do not add a second place that computes either.

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
- **Venue codes are canonical, and a bare code is rewritten only when it names a country.**
  `canonicalRegion` maps CLDR's retired codes to current ones (`FX`→`FR`, `UK`→`GB`,
  `SU`→`RU`) through `Intl.getCanonicalLocales`. The name index needs it: it kept the
  last code sharing a name, so "France" was stored as `FX` and never merged with an
  issuer writing `FR`. A two-letter value goes through it only if `Intl.DisplayNames`
  names it in some locale, because Bloomberg exchange codes share the space with ISO:
  `CT` (Toronto) and `JT` (Tokyo) are also retired CLDR codes for Kiribati and US
  minor islands, unnamed, so they stay as written. Known gap: `BU` is named (Myanmar)
  and may be Bloomberg's code for Bulgaria; an exchange column carrying it would be
  rewritten to `MM`. A test pins every rewrite ICU makes, so a Node upgrade that
  changes the table fails there.
- **The "obsolete country codes" notice on Instruments is temporary.** Holdings stored
  before the fix keep keys like `SAN.FX`; `hasObsoleteVenue` flags the fund at read and
  the notice clears when its file is dropped again (`EtfHolding` is replace-only).
  There is no migration on purpose: the original country text is not stored, a rewrite
  can collide on `@@unique([instrumentId, identity])`, and the `SecurityIdentity` rows
  were resolved without an exchange filter. Orphaned identities are harmless. Remove
  the notice from v0.14.0 on: nothing can store a retired code any more.
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
- Resolution happens in **`pnpm identity:resolve`**, not when a composition is dropped on
  Instruments. It is cached permanently including misses, and runs in **descending weight
  order** — unauthenticated the endpoint allows 10 jobs per request and 25 requests a
  minute, so five thousand leaves is twenty minutes; ordering by weight means a couple of
  hundred lookups already cover every row that is drawn.
- **A miss is an answer; an unanswered request is not.** Because misses are cached for
  good, a batch that fails (status, network, timeout, a payload that is not an array) must
  never become `not-found`, as it once did. `resolve` returns `{ resolutions, unavailable }`
  and stops at the first such batch; the script saves only what was answered.

## Currency exposure

- **OpenFIGI's `/mapping` response has no `currency` field.** `currency` is a request
  *filter* only. The response carries `figi`, `securityType`, `marketSector`, `exchCode`,
  `securityType2`, `ticker`, `name`, `shareClassFIGI`, `compositeFIGI`,
  `securityDescription`. Checked against the official docs; do not go looking for it again.
- **OpenFIGI does not say which listing is primary, and no rule over that payload can.**
  Measured, not assumed: NVIDIA's ISIN returns 247 rows and **sixteen** self-composite ones
  (US, GR, MM, SW, CI, CB plus multi-currency MTF lines `NVDAEUR`, `NVDAGBP`, `NVDAJPY`…),
  all `Common Stock`, one `shareClassFIGI`, one `name`. Accenture returns nine. Nothing
  separates them — not `securityType`, not `securityType2`, not the ticker (NVIDIA's
  shortest is `NVD`, Frankfurt). Every large cap looks like this. A first version refused
  on "more than one country" and refused **5100 of 5153** resolved identities.
- **So the country comes from outside and OpenFIGI only confirms it — three branches, in
  order.** (1) The venue the issuer published (`NVDA.US`): a fact of the holdings file, no
  provider, no quota, no re-resolution, and **4086 of 5153** identities are venue-qualified
  tickers. (2) A bare ISIN proposes its registered country and is taken only if a row of
  that share class actually carries that country's code. (3) Anything else is unresolved.
- **The ISIN prefix never decides alone — that is what makes branch 2 safe.** Accenture is
  `IE00B4BNMY34`, and not one of its 120 rows carries an Irish code, so the prefix proposes
  IE, nothing confirms it, and the answer is unresolved — never EUR. Verified live: NVIDIA
  → USD, Nestlé → CHF, ASML → EUR, Accenture → unresolved.
- **Confirm against every row, not only self-composite ones.** ASML has twelve
  self-composite rows and none is Amsterdam, while its Amsterdam listing is present as a
  venue row under a composite FIGI the payload never returns. Requiring a self-composite
  row reports a Dutch blue chip as unresolved.
- **`SecurityIdentity.exchCode` stores the code; the currency is derived at read.** Same
  rule as the plan storing euros and deriving the weight. A wrong entry in the translation
  table is then a one-line fix, not a re-resolution of five thousand identities.
- **The cache never re-asks a resolved identity**, so a column added later stays null
  forever without `identity:resolve --refresh`.
- **`bloombergCurrency` is deliberately not `BLOOMBERG_EXCHANGE` inverted.** That table's
  own comment says a wrong or missing entry costs nothing, and that is true only because it
  narrows an already-ambiguous set. Here a wrong entry is a wrong currency on screen with
  nothing to catch it. Bloomberg's codes are not ISO's and two pairs read as typos: `IT` is
  Israel (Italy is `IM`), `ID` is Ireland (Indonesia is `IJ`). Both are pinned by tests.
- **Hedging is a property of the vehicle and is not in any market data.** A "Physical Gold
  USD (EUR Hedged)" ETC and an unhedged one quote on the same venue in the same currency;
  only the prospectus differs. `Instrument.hedgedToBase` is set by hand and excluded from
  `InstrumentWriteData`, exactly like `ter` — widen that type and a re-import destroys it.
- **The fold is over contributions, never over leaves.** One company held directly and
  through a hedged fund is one leaf and two different currency exposures; folding at the
  leaf would have to pick one and be wrong for the other. This is the payoff of
  contributions being kept rather than summed.
- **Currency exposure converts nothing.** Every amount arriving is already in euros,
  because valuation converted each price before it got here (`pricesInBase`). This labels
  and sums. The currency it reports comes from the leaf, never from the currency the
  quote line happens to trade in. The IPC pipeline is a price index, not a rate source.
- **ECB rates: one currency per request, and the sync restarts from the last day
  stored.** Measured 2026-10-20: asking for several at once (`USD+XYZ`) drops an unknown
  one silently; alone, it is a 404 with `title: "Not Found"`. A rate for day D appears
  around 16:00 Madrid, so a sync in the morning finds none for D; restarting from the
  last day in `FxRate`, never from the last check in `FxSync`, is what asks for D again.
  A rate that arrives different for a stored day refuses the whole batch.
- **A series starts a week before its currency was first used, never in 1999.** First
  use is the earliest `LedgerEntry.ts` or `PriceSnapshot.asOf` in that currency; the
  week covers a closing as long as Easter. A cold ECB query costs about 1.4 s per year
  of range (measured 2026-10-20; the whole history since 1999 took 41–52 s), so asking
  for nothing older than the portfolio is what keeps the sync usable behind a button.
  A code given by hand and not in use goes back 30 days. The sync goes back again only
  when a currency's first use is older than its first stored day — an older export
  imported later — never because the margin fell on days with no rate.
- **Until 2012 the ECB printed closing days as rows with an empty rate** (`OBS_STATUS=H`
  in the full detail; `dataonly` shows only the empty value). The parser drops a row
  with an empty rate and still refuses any other malformed one.
- A leaf with no known currency lands in its own bucket at full value and is never
  pro-rated — same rule as `UNRESOLVED`, `unpricedCount` and a missing CPI month.

## Projections

- `computePositions` uses **AVCO** (weighted average cost) for the portfolio view.
  **FIFO** exists only for foral tax (`computeTaxHistory`, over the `walkFifo` fold in
  `core/tax/`) and is a **separate** projection. Do not merge them.
- **Two money-in figures, both with fees included, and they are not interchangeable.**
  *Cost of what you hold* ("Coste de lo que tienes") is the AVCO cost of the open
  positions — `computePositions.costBasis`, `computeCostBasisTimeline`, the chart's cost
  line, and `PortfolioSummary.openCost` (priced or not). *Total contributed* ("Total
  aportado") is the money that left the bank: every purchase paid in cash, sold ones
  included — `computeReturns.totalInvested` and `computeTotalContributed`, which in real mode
  restates each purchase at its own month. The XIRR flows use the same per-trade amounts.
  Fees stay inside both because the foral rule puts inherent costs inside the acquisition
  value, and excluding them flatters returns.
- **An `IN_KIND` purchase is cost but not contribution.** A Kraken reward or a Trade
  Republic saveback is `funding: "IN_KIND"`: it enters AVCO and FIFO at its market value on
  receipt, and stays out of *Total contributed*, the contribution count, the average and
  the XIRR flows (`isInKind`), on both sides of the opportunity cost too. **TWR keeps it**:
  `portfolioFlows` carries every trade and only the MWR list filters, because value
  arriving with no flow behind it is booked by TWR as return. `since` comes from the full
  list. Expect MWR to rise when units arrive for free; that is the point, not a bug.
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
- **`DEFAULT_SIMULATIONS` is measured, not chosen.** `pnpm projection:converge` runs the
  same input the screen builds — both go through `loadProjectionContext`, so a script
  rebuilding it by hand would tune a default for a different case — at several N and
  several seeds, and reports `(max − min) / median` **per percentile**. The bar is 1%: the
  screen prints euros to the cent, and a figure that swings 5% on a seed nobody chose is
  not one anybody can act on. A worst-of-three verdict was tried and removed — it hides
  which percentile is the problem, which is the only useful thing the run has to say.
  Cost rises linearly in N and **linearly times ~60** on any screen that also solves a
  goal, because each bisection step re-runs the whole simulation. A test pins the constant
  for the same reason one pins `MIN_WINDOW_MONTHS`.
- **Spread across seeds is a standard deviation, never a range.** `max − min` grows with
  the number of seeds by construction, so a range-based threshold measures how many seeds
  were run as much as how settled the figure is, and two runs at different `--seeds` cannot
  be compared. It also invents plateaus: on the range metric p90 looked as if it stopped
  responding to N entirely, and it does not. This was measured wrong once — do not
  reintroduce it because a range is easier to read.
- **The tail is noisier at every N, and that is not the same as being unfixable by N.**
  Measured over the plan held, 72-month window, 240-month horizon, 24 seeds: at `10000`
  p10 is 0.97%, p50 1.05%, p90 3.78%. All three fall as `1/√N` — p90 included — so p90
  reaches the others' 1% at roughly 140000 simulations, not never. A tail is estimated from
  far fewer of the drawn paths than the median, which is a variance cost and is paid in N;
  **the window has nothing to do with it**, and prescribing a backfill for it sends the
  reader to fix the wrong thing. `10000` is the point where the ~60 simulations behind every
  goal solve stop being worth another halving, and the screen states that the good scenario
  is the least firm of the three instead of buying steadiness nobody asked for.
- **The `1/√N` check is fitted over the whole grid and needs enough seeds to mean
  anything.** It flags a percentile whose spread falls slower than `N^-0.5` — the signature
  of a sample-limited estimate rather than a sample-count-limited one. Two traps, both hit
  once: reading only the first and last row makes the verdict a coin toss, because each
  spread is itself an estimate; and at 8 seeds the fitted exponent for p90 read `-0.26`
  where 16, 24 and 48 seeds read `-0.43`, `-0.46`, `-0.52`. The script printed
  *window-limited* on the strength of that noise. Hence `--seeds` defaults to 24 and the
  verdict is withheld below 16. **On this plan nothing is window-limited.** Widening the
  window (`pnpm prices:backfill` on the limiting instrument) is still the lever that
  matters, but for **accuracy**, not for seed-to-seed steadiness. Do not conflate the two.
- **The tails converge later than the median**, so all three percentiles are reported
  separately and the median looking settled is not evidence that p10/p90 are.
- **p25/p75 are two more reads of an already-sorted array**, so `computeProjection` always
  returns them and `?detail=1` only decides whether the screen draws them. They are
  inserted between the three scenarios, never in place of them: the default panel is
  exactly what it was before the toggle existed.
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
  a real return against nominal money. The Summary loader builds a second, un-deflated
  series for it. Portfolio TWR is **not** an average of the per-instrument TWRs — a return
  is not additive.
- **Valuation is in euros, and a price in another currency is converted, never mixed.**
  Today's value uses the last rate published, at most a week old; each past close uses its
  own day's (`valuationRate`). A position whose currency has no rate in that week is left
  unvalued exactly like an unpriced one and named. A fund named "USD Acc" states the fund's
  *denomination* currency, not the currency of the line being bought — a euro line of it
  needs no conversion.
- Positions without a usable price are excluded from **both** `totalValue` and
  `totalInvested` (= `pricedCost`, what `returnPct` and the all-time hero change measure
  against), and reported via `unpricedCount` / `unpricedCost`. Adding a cost without its
  value invents a loss. `openCost` is the one figure that includes them.
- **The Summary line, TWR and MWR leave out every open unpriced instrument whole**, sales
  included, through one set: `unpricedOpenIds` → `withoutInstruments`, and the filtered
  ledger feeds both the series and the flows (`twr:explain` does the same). Filtering only
  the series keeps a flow with no value behind it and breaks a TWR link. Closed positions
  stay in, priced or not — nothing is held, so nothing needs a price.
- **A return is stated through `periodReturns`, on Summary and on an instrument alike.**
  From the first included trade to today, independent of the range selector, on the
  `YEAR_MS` 365-day year `xirr` uses: a year or more shows the annual figure with the
  cumulative beside it; under a year, the period return (`(1 + IRR)^years − 1` for MWR).
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
- **The month of a trade is Madrid's, never UTC's.** `periodOf` reads it in the calendar
  zone (*Calendar and zones*). Spain is +1 in winter and +2 in summer, so the last hour(s) of
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
- **`lastSyncedAt` comes from `InflationSync`, a row written on every sync attempt** —
  including one that finds nothing new, which is the case the freshness check exists for.
  Deriving it from the newest `InflationIndex` row instead collapses it back into
  `latestPeriod()`, and the badge then answers the question it was meant to distinguish from.

## Fees (TER)

- **`Instrument.ter` is entered as a percent and stored as a fraction.** `terPercentSchema`
  does the conversion and bounds it at 0–5% a year. The bound is at the **write** boundary
  only: `instrumentSchema` stays lenient, because a stored value the domain refused would
  throw on every read of the instrument list — the `LedgerEntry.type` trap one layer up.
  Nothing is written until it parses: "0,22" typed as a fraction is 22% a year, and a fee
  wrong by a factor of a hundred looks entirely plausible on screen.
- **The instrument row's "dirty" check parses, it does not string-compare.** `terInputMatches`
  runs the current input through `terPercentSchema` and compares the resulting fraction to
  the stored one — the same schema that decides the write decides whether the row still
  differs. A string compare against `terToPercentInput(stored)` leaves the row dirty after a
  correct save whenever the typed form is not byte-identical to the canonical one (`0.22`
  vs `0,22`, a trailing zero, surrounding spaces), so the save silently never confirms. Do
  **not** "fix" that with a post-save `useEffect` that rewrites the field. This is the
  pattern to generalise the day a second inline-editable table exists — not before: as of
  v0.5.2 `InstrumentsTable` is the only one, every other editable surface is create-only or
  URL-as-state and compares nothing.
- **An instrument with no TER is excluded and named, never counted as 0%.** Same rule as
  `unpricedCount` and an `UNRESOLVED` leaf. In the weighted average it leaves the
  denominator; in the projected cost it contributes nothing, which makes that figure a
  **floor**, not an estimate. Dropping the line from the blend instead would redistribute
  the weights and make the difference something other than fees.
- **The projected cost is a counterfactual, not a drag.** A fund's price is already net of
  its TER — that is how a fund works — so subtracting the fee inside `computeProjection`
  would charge it twice and bias every scenario low. The fee is added **back**:
  `(1 + ter)^(1/12)` a month, so twelve months compound to exactly one year of fee, the
  same convention `impliedAnnualReturn` annualises with.
- **The fee-free twin shares the drawn month and the loop, and the cost is per path.** Both
  pots get a twin — off-plan money is in real funds paying real fees. Two runs on the same
  seed would agree on the draws too, but subtracting p90 from p90 subtracts two *order
  statistics*: the ninetieth-worst fee bill is not the fee bill of the ninetieth-worst path
  unless the ranks line up, which is a coincidence, not a rule. `simulate` therefore
  accumulates both and diffs before sorting.
- **`terCost` is opt-in.** A goal solve re-runs the whole simulation about sixty times and
  none of those runs has anything to say about fees, so `computeProjection` builds the twin
  only when asked and only when some line actually carries a TER.
- The weighted TER is by **current market value** — "what you pay today", not what the plan
  would pay once it is met. `/ter-cost` reads `?years` with the projection's own parser and
  has no form of its own: it is a report derived from the ledger plus the manual fee, like
  `/realized` and `/opportunity-cost`, so it has no sidebar entry either.

## Portfolio target (the savings plan)

- **Versions are resolved by `activeFrom`, never by `createdAt`.** `getActiveTarget(targets,
  day)` picks the latest `activeFrom <= day` — the same rule that makes `latest()` order
  prices by `asOf`. A plan recorded late belongs to the past it was written for.
- **`activeFrom` is a calendar day (`YYYY-MM-DD`), one version per day.** It was an instant,
  and a version recorded at 00:00Z took over at 01:00 Madrid. Callers pass
  `today(zone, now)`. The column is `TEXT` with a format CHECK and a UNIQUE index, nullable
  only because SQLite cannot ADD a NOT NULL column without a default; `portfolioTargetSchema`
  requires the day on read and on write. The form and `target:set` refuse a taken day by
  naming the version there (`targetOnDay`); the index is the backstop. `createdAt` is
  audit only. The migration that converted it kept, per Madrid day, the version that was
  in force and deleted the rest, because the container migrates on start and must not
  fail on a duplicate.
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

- **Never cite an NF 13/2013 article number without a verifiable source for it.** Two
  were fabricated during initial development (`Art. 47.2` for the wash-sale rule, `Art.
  71` for carryforward — both plausible chapter-adjacent numbers, both wrong; correct are
  Art. 43 and Art. 66). The wash-sale citation was the invention, not the number: since
  NF 6/2025 (12 December, BOB 15/12/2025, effective 1 January 2025) `Art. 47.2` exists
  with other content — FIFO for fungible crypto-assets of the same type (NF 13/2013
  consolidated at 01/01/2026). Cite it only for that FIFO, never for the repurchase rule.
  A guessed-but-plausible citation is worse than none: it invites
  trust nobody checked. If the article cannot be confirmed against the actual text, write
  the comment without a number ("regla de recompra a corto plazo, Bizkaia — ver nota de
  Aritz") rather than inventing one that reads as authoritative.
- **Art. 43 defers a loss in proportion to the repurchase; it never deletes it.** The
  non-computable part is `loss × repurchased / sold` and stays on the units that acted as
  the repurchase until they are transmitted with no new repurchase in their window — then
  it computes in that year, as its own line, never netted into that sale's result. That
  sale is assessed **whether it is at a gain or at a loss** (V1403-21: the later
  transmissions must be definitive "con independencia de que determinen ganancias o
  pérdidas patrimoniales"): a repurchase in its window moves the carried deferral on to the
  new units, same quantities, same one-sale-per-unit rule. Its own gain is never held
  back, and a gain carrying nothing is not assessed and claims no units. An earlier version
  integrated everything on a gain sale; that contradicted the ruling. The arithmetic follows
  the DGT on the parallel art. 33.5.f LIRPF — **V1403-21** (purchases before the sale count
  only if still held: `min(before, R)`), **V1117-21** (purchases after: proportional),
  **V3282-18** (the chain). They do not bind the Hacienda Foral; comments and UI say so.
  This replaced an earlier whole-row exclusion that dropped the loss for good.
- **Two allocation rules are Quoin's own, not the DGT's, and are labelled so.** A unit
  repurchases one sale only, oldest sale first (a unit already claimed is out of `before`
  and out of the held units a later sale can use); the held units that receive a deferral
  are taken oldest acquisition first, then purchases after the sale. Within one lot a
  deferral is spread pro rata over the units still held. Do not present any of these as
  doctrine.
- **Crypto falls under Art. 43.i for transmissions from 1 January 2025, and under no
  rule before** (NF 6/2025). The rule is chosen by the Madrid day of the transmission.
  Core takes a repurchase class per instrument, built in the app from `Instrument.type`
  — a field ingestion writes from the broker's asset class, unlike the hand-set
  `exposureKind` — and throws on a sale with no class, so no caller can silently apply
  the wrong letter. An ETN that trades on an exchange is a listed security under letter
  g. A crypto loss before 2025 rebought within a year gets a notice — some doctrine
  would apply a one-year repurchase rule, and it is unsettled — and changes no figure.
  Do not tie that rule to securities not admitted to trading: an earlier wording did,
  and it misattributed the doctrine.
- **Core fixes the trade order: `ts`, then BUY before SELL, then `externalId`.** The same
  `compareTrades` drives `walkFifo` and the rule; the repository's `orderBy` sorts by `ts`
  alone and SQLite breaks ties however it likes. Before/after a sale is by instant, never by
  calendar day — the window itself is Madrid calendar days (`washSaleWindow`).
- **Nothing FIFO is persisted, and it is one pass.** `computeTaxHistory` walks the whole
  ledger once — a deferred loss can compute years after the sale that created it — and
  `taxYearOf` / `carryforwardFrom` are views over it. No lot table, no stored deferral, no
  carryforward countdown. A deferred loss counts in the year it computes, so the four-year
  window of Art. 66 starts there; restricting the walk to `[targetYear − 4, targetYear]` is
  still what enforces expiry.
- **`TAX_SCALES` is keyed by `(territory, year)`.** A year not on file returns `null` from
  `getTaxScale` and the screen states the absence — never fall back to the nearest year's
  brackets. A rate is data; a superseded scale is a wrong number that looks right.
- **The fiscal year is the calendar year in the residence's zone** (`fiscalYearOf`, Madrid
  for Bizkaia), same trap as `periodOf` — the last hours of 31 December are already the
  next year locally. The zone travels in `RepurchaseScope` beside the territory.

## Kraken rewards

- **A reward is an acquisition with no counter-leg**, valued first at Kraken's own figure:
  `amountusd − feeusd` over the net quantity, in USD, converted to euros at the ECB rate of
  its day and marked `valuationSource: "kraken-amountusd"`. Only a row with no `amountusd`
  falls back to the price history at the moment of receipt, injected as `PriceAt` —
  `mapGroup` stays pure and never fetches — and is marked `"yahoo"`. Zero cost hid the
  income *and* inflated every future realised gain by the whole value of the units.
- **No value from either source means discard (`reward-unpriced`), never zero.** A discard is
  counted and printed; a zero is a wrong number that looks like data. Fix by running
  `prices:backfill` and importing again — dedup by `refid` makes re-import safe. The
  fallback reads prices **before** anything is written, so a first import into an empty
  database sets every reward without `amountusd` aside; the wizard re-imports the same file
  after its price step and `pnpm ingest` offers to, both merging the two writes with
  `mergeRewardRetry`. An unpriced reward still carries its instrument, so a file of nothing
  but rewards creates it and the mapping step can reach it.
- **The lookup never reaches forward.** `priceLookupFrom` takes the last price *known* at or
  before the timestamp, within 7 days: a daily candle counts from 24 h after its date,
  because Yahoo dates it at the session open and fills it with the close, and a live row
  from its own time (`snapshotKnownAt` in `core/prices`). Keyed by the candle's date, a
  reward late on day D read D's close, which did not exist yet.
- Every asset Kraken trades against fiat is modelled; there is no asset allow-list. A swap
  between two crypto assets is two linked rows (`linkKind: swap`), set aside whole as
  `swap-unpriced` if either leg has no value.
  The Kraken invariants (schema, balance check, valuation, internal moves) live in
  `app/adapters/README.md`. **A discard is classified by what it does to a modelled
  position, not by asset.** `swap-unpriced` (a `stable_coin` is crypto, not fiat),
  `crypto-transfer` (on-chain in or out), `fx-unavailable` (a row in another currency
  with no ECB rate for its day, from any adapter, see *CSV ingestion*), `reward-unpriced`,
  `earn-return-unverified` and `invalid-crypto-code` each leave a position wrong, and `AFFECTS_POSITION` flags
  them so the wizard and `pnpm ingest` warn. Every Kraken discard
  carries a per-group detail (date, type, subtype, asset or pair — never amounts).
  `DiscardReason` is a union and its labels are `Record<DiscardReason, string>` in both
  locales, so a new reason without a label or a position decision does not compile.
- **A reward's income leg is a `DIVIDEND` event, not a dedicated type.** The shape already
  fits — instrument plus gross amount, no quantity needed — and a new type would touch the
  SQLite `LedgerEntry` CHECK migration for no functional gain. `mapGroup` emits it alongside
  the BUY, same market value, distinct `externalId` (`refid:income`) so both survive dedup.
  Both legs are `funding: "IN_KIND"`, and that — not the note — is what makes the income
  "Recompensa" on screen and keeps the BUY out of contributions. The notes stay for
  `symbol-check`, which excludes the BUY because its price came from a history.
- **No tax figure reads this income, and its classification is pending.** `/tax` lists the
  year's `IN_KIND` dividends in their own block, "pendiente de verificar", added to nothing;
  a test pins that `computeTaxHistory` and `buildTaxYearView` are unchanged by them. Do not
  write a classification into a comment or a total until it is verified.

## Trade Republic saveback

A `BENEFITS_SAVEBACK` row is cash with no units, followed by the purchase it paid for.
`pairSavebacks` joins them, pure, before mapping: a `TRADING|BUY` within **7 calendar days
after** the saveback (measured on a real export: 1 day pairs under a third, 3 days all but one —
a long weekend — 7 days all of them), of the saveback's instrument when it names one, for exactly
`amount − |tax|` of the saveback. That one rule covers both regimes: until Nov 2025 the
retention sits on the purchase's `tax` and the gross is bought; from Dec 2025 it sits on the
saveback and the net is bought. Dec 2025–May 2026 savebacks carry no name or ISIN, so the
amount alone decides there.

- **A pair counts only when it is unique both ways** — one candidate for the saveback, and
  that purchase a candidate for no other saveback. Anything else is `saveback-unpaired`:
  the purchase stays `CASH`, which overstates contributions, never invents free units.
  Rows are deduplicated by `transaction_id` before pairing, or a repeated line is an
  ambiguity that does not exist.
- **A pair is one operation in two rows**, like a Kraken reward: the purchase as `IN_KIND`,
  and the saveback as an `IN_KIND` `DIVIDEND` in that fund, carrying the retention from
  whichever row holds it. Movements then nets each pair to exactly the cash that moved.
- **The only write that changes a stored ledger row is `markInKind`.** Saveback rows were
  discarded before this existed, so past purchases sit in the ledger as `CASH` and only a
  re-import can mark them; `append` skips existing rows, so `persistBatch` calls
  `markInKind` after it. It flips `funding` from `CASH` to `IN_KIND` on rows matching an
  `IN_KIND` event by `(source, externalId)` — never the reverse, never another column. Not
  the reverse because an export that cuts a pair in half maps the purchase as `CASH`, and
  re-importing it must not undo a pair an earlier file found. An integration test pins that
  no other column moves. Every other ledger write is append-only.

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
  most column changes) will silently drop it. Re-add it in that migration. Adding `funding`
  is the measured case: `migrate dev` generated a rebuild for a plain new column, so it was
  written with `--create-only` as `ADD COLUMN`. `funding` has its own CHECK
  (`CASH | IN_KIND`), same reason as `type`.
- **Which `fxSource` fits which row is the domain's rule, checked at write, and never a
  database CHECK.** `ledgerEventWriteSchema` (called by `eventToCreateData`, the only
  ledger write path) allows `IDENTITY` only for a row in EUR with no `fxRate`,
  `fxDirection` or `fxDate`, and any other source only for a row in another currency
  with all three — so nothing new can count a foreign amount one-to-one, as the Kraken
  mapper once did. The migration CHECKs only the values of `fxSource` and `fxDirection`.
  A CHECK naming `currency` was written and withdrawn: an existing row that breaks it
  makes the `ADD COLUMN` itself fail, and ledgers outside this one hold Kraken USD
  deposits booked at 1:1 before `foreign-fiat` existed — that container would never
  start. An integration test applies the migration over such a row. Reads stay lenient
  (`ledgerEventSchema`), the `LedgerEntry.type` lesson: an old row that breaks the rule is
  read, and `toBase` answers it with an explicit `no-rate` rather than throwing or counting
  it 1:1. `originalAmount` and `originalCurrency` are informational and constrained by
  nothing.
- **Every ledger amount reaches euros through `toBase(event, field)` in `core/fx`**, never
  a multiplication at the call site. `IDENTITY` returns the amount untouched — a Kraken
  reward worth a fraction of a cent keeps it. A converted amount divides by `fxRate`
  (`QUOTE_PER_BASE`, the ECB's currency per euro) or multiplies by it (`BASE_PER_QUOTE`)
  and is rounded to the cent, `ROUND_HALF_UP`, field by field — dividing by the
  published rate is exact up to that rounding, where storing its inverse was not, which
  is why `fxToBase` was dropped.
- **A row with no rate is excluded and named, never valued at 1:1** — the `unpricedCount`
  rule, one step earlier. `toBase` returns `{ ok: false, reason: "no-rate" }` for an
  `IDENTITY` row not in EUR or a conversion missing its rate or direction. `bookable`
  drops **every** row of an instrument with a trade like that — dropping one trade would
  unbalance AVCO and FIFO — and a dividend or cash row like that alone. Every core entry
  point that values the ledger runs it itself (`walkAvco`, `sortTrades` and so FIFO and
  the tax history, the cost line, contributions, TWR/MWR, the opportunity cost, in-kind
  income), so no screen can forget it; they then read amounts through `baseOf`, which
  throws only if that invariant is broken. What is excluded is named: Portfolio and
  Summary through `unconvertibleInstrumentIds`; the tax view of `/realized` and
  `pnpm tax:explain` through `taxExclusions`, because a holding missing from a tax
  report in silence is the worst place for it; Movements keeps the row with "—" and
  "No exchange rate" instead of an amount, and leaves it out of the net cash flow.
## CSV ingestion

**The broker is detected from the header row, never from the filename and never by
guessing at the body.** `detectBroker` matches `transaction_id` → Trade Republic and
`refid` → Kraken, and returns `null` unless **exactly one** signature matches — a file
carrying both, or neither, is refused by name rather than half-parsed. The CLI still takes
`--broker`; the import screen has no selector, because a selector is one more thing to get
wrong about a file that already says what it is.

papaparse behaves differently under ESM/tsx than under CJS. **Both** guards are required
and are applied defensively to every adapter:

1. `skipEmptyLines: 'greedy'`
2. a pre-validation filter dropping any row without a `type` field

Append is idempotent: dedup by `source` + `externalId`.

**`BatchBuilder` converts and applies `ledgerEventWriteSchema` while planning, for every
adapter.** An event in another currency with no conversion gets the ECB rate of its Madrid
day through `bookingRate` (`fxSource` ECB, rate, `QUOTE_PER_BASE`, day). With no rate the
whole operation is set aside as `fx-unavailable` — so a saveback pair is never cut in
half — the currency and earliest day go into `ratesNeeded`, and the rest of the file
imports. `planWithRates` plans, syncs what was missing and plans again; the preview,
the commit, the reward retry and `pnpm ingest` all go through it, so they agree. Kraken
books a trade, deposit or withdrawal in its own fiat and the batch converts it; the
balance held in that currency, and its gain or loss, are not modelled. Trade Republic
keeps its own EUR charge (`IDENTITY`) and stores `original_amount` / `original_currency`
when both are present; `fx_rate` is not stored. Any other break of the rule
is a bug in the adapter: `build()` throws `InvalidLedgerEventError` (date, type, currency,
never amounts), which `api/ingest` turns into a 400 before anything is written,
instruments included. It throws from `build()`, outside the adapters' per-row `try`,
because those count an exception as one bad row and carry on. `eventToCreateData` still
validates as the last line.

## URL as state

Sort order (`/portfolio`), chart range (`/`), page (`/movements`), the rebalance inputs
(`/allocation`, `?contribution=500`, `?drift=2`) and the projection's extended percentiles
(`/projection`, `?detail=1`) live in **URL search params**, written by the UI and read by
the **loader**.

**A preference is not view state.** The concentration threshold and the benchmark are
cookies set only from `/settings` (`quoin-threshold`, `quoin-benchmark`), parsed by the
loaders that use them. The threshold used to be `?threshold=` plus a slider on
`/allocation`; that was removed so it has one home. Do not re-add a URL override: two
sources for one setting is the thing this replaced.

**Routes, params and param values are all English, and they do not follow the UI locale.**
One route tree, no `/en/` prefix: a URL is an address, not copy, and localising it would
make a shared link mean different things to two people. `?view=exposure|rebalance|currency|
overlap`, `?mode=list|matrix`, `?view=sales|tax`.

A `<Form method="get">` **rewrites the whole query string** from its own fields, so any
param already in the URL that is not a field of that form is dropped on submit. A GET
form therefore re-emits every param it does not own as a hidden input — **all of them,
read from the URL, never a hand-kept list** (`carriedParams`). The list version is not
a smaller version of this: it works until someone adds a param elsewhere on the page and
never thinks about that form, which is exactly how submitting the rebalance split started
throwing the user back to the exposure tab. No context, no state lifting, and the view stays
shareable. A route opts into the header's range selector with `handle = { range: true }`;
`handle.title` sets the header title and is a `(t: Copy, data) => string`, not a string.

## Route modules

- **`_shell.tsx` owns the only `<main>`, and the only page padding.** A route renders a
  fragment, not a landmark. A second `<main>` is invalid HTML and breaks landmark
  navigation in a screen reader, and repeating `px-4 py-8 md:px-6` inside it double-insets
  that screen against every other one — both passed typecheck, lint and build for months
  on `/instruments` and `/target`. `root.tsx` keeps its own `<main>` and is **not** the
  same bug: its `ErrorBoundary` replaces the whole subtree below root, so it never
  coexists with the shell's.
- **A route does not write its own `ErrorBoundary`.** It re-exports the shared one:
  `export { ErrorBoundary } from "~/components/ui/ErrorBoundary";` — imported from the
  file, not through the `~/components` barrel, so ten route modules do not each pull sixty
  exports through their own chunk. Write a bespoke one only when it says something the
  generic card cannot; `instrument.tsx` is the only case (it distinguishes a 404 and
  offers the way back).
- **The error arrives as a prop, never from `useRouteError()`.** `{ error }:
  Route.ErrorBoundaryProps` is the Framework Mode signature; the hook is Data Mode's and
  works here only by compatibility. The shared component cannot use that type at all —
  `params` and `loaderData` are generated per route, so a component with no route has no
  `Route` namespace to import. It takes **no props**: it renders nothing from the error,
  and an unused `error: unknown` would be decoration.

## Tailwind v4 — a nonexistent class is silent

`bg-surface-1` and `text-warning` do not exist in this theme. Tailwind emits nothing for an
unknown token and raises nothing, so **typecheck, lint and build all pass** and the element
simply renders unstyled. Check `app/app.css` for the real tokens before inventing one:

- surfaces — `--color-bg`, `--color-surface`, `--color-surface-2`
- lines — `--color-border`, `--color-border-subtle`
- text, lightest to faintest — `--color-text`, `--color-body`, `--color-muted`,
  `--color-faint`
- the inverted pair — `--color-accent` and `--color-on-accent`, always together: accent is
  near-white on dark and near-black on light, so anything painted `bg-accent` needs
  `text-on-accent` or it disappears in one theme
- signals — `--color-positive`, `--color-negative`
- the ramp — `--color-dn-1..5`
- non-colour — `--font-sans`, `--font-mono`, `--spacing-gutter`, `--spacing-row`,
  `--spacing-header`, `--radius-card`

`dn-1..5` is a **greyscale ramp**, not a categorical palette. The design is monochrome and
green/red are reserved as semantic signals — a category is not a warning.

**Every figure carries `font-mono`** (Geist Mono, `TABLE_NUM` in `app/components/ui/table.ts`
for table cells). Amounts are read down a column, and a proportional face makes the digits
of one row a different width from the row above it. Prose stays `--font-sans`.

## Theme — the server cannot know what "system" resolves to

`Theme` is `dark | light | system` (`app/lib/theme.ts`), stored in the `quoin-theme`
cookie and written by `/settings`. The third value is what makes this awkward: the OS
preference lives in the browser, and the cookie does not carry it.

- **The server always renders `resolveTheme(theme, false)`**, so `system` arrives as
  `dark`. That is a deliberate lie corrected before paint, not a default to "fix" by
  guessing in the loader. `prefers-color-scheme` is not a request header.
- **`THEME_SCRIPT` runs inline in `<head>`, before React.** It reads the cookie, asks
  `matchMedia` and sets `document.documentElement.className` itself. Move it below `<Meta/>`
  and `<Links/>`, or defer it, and a light-mode user gets a dark flash on every navigation.
- **`suppressHydrationWarning` on `<html>` is load-bearing**, because that script has
  already changed the class React is about to hydrate against. Removing it turns the
  correction into a console error on every load for anyone on `system` plus a light OS.
- The setting writes the cookie and the class **from the client**, with no revalidation:
  nothing on screen depends on the theme server-side, so a round trip would only cost a
  flash. Do not turn it into an action.

## Locale — the mirror image of the theme

Both are a cookie written by `/settings`, and the resemblance stops there. The theme is a
class name the browser can apply alone; the locale decides what the **server** renders, so
the two controls sitting side by side behave differently on purpose.

- **`LocaleSetting` revalidates, `ThemeSetting` does not.** Loaders resolve copy and
  formatters from the cookie, so a client-only write would leave every server-rendered
  string stale until the next navigation. `/settings` now has a loader (the benchmark
  list: instruments plus one grouped `PriceSnapshot` query), so a language change costs
  that round trip too — still not worth optimising away.
- **The benchmark setting is a list of eligible instruments, never free text.** Eligible
  is exactly what `loadOpportunityCost` refuses without: a `quoteSymbol` plus at least
  one close that can be valued in euros (`benchmarkCandidates` over `convertibleStarts`). A stored symbol that stops qualifying stays
  selected and flagged; substituting the first valid option would compare against an
  index nobody chose.
- **`Copy` is `typeof es`, and `es` is deliberately NOT `as const`.** Literal types there
  would force every other locale to repeat the Spanish strings verbatim. Widened to
  `string`, `en: Copy` makes a missing or misspelled key a **compile error** — that type
  is the only thing standing between a 1,100-key object and a string that silently stays
  Spanish forever. Do not "tighten" it back.
- **A formatter has no default locale; a collator does.** `createFormat(locale, zone)` exports
  no free `formatMoney`, because a Spanish figure under an English label is unfalsifiable
  on screen — `1.234,56` is a valid English number too. The collator tag defaults to
  `es-ES` (`toInstrumentListItems`, `sortRealizedRows`, `groupRealizedByYear`,
  `toTerRows`) because a name list in the wrong collation is a **different order, not a
  wrong number**. That asymmetry is the rule, not an oversight.
- **In `meta`, the match key is `loaderData`, not `data`.** `copyFromMatches` finds the
  match whose loader data carries a `locale`. Reading `data` fails **silently**: every
  visible string is still English because components use the hook, and only `<title>`
  falls back to Spanish. Cost a runtime check to find; pinned by a test now.
- **`handle.title` is `(t: Copy, data: unknown) => string`**, never a bare string — the
  header title is copy, and a module-level constant is evaluated before any locale exists.
- The `es` export is for **tests only**. A component importing `es` instead of `useCopy()`
  is hardcoded Spanish that typechecks, lints and builds.

## Spacing

The scale is Tailwind's own, restricted to **whole steps** — `1 2 3 4 6 8 16`. Half-steps
(`py-2.5`, `gap-3.5`, `mt-0.5`) are for optical adjustment **inside** a control, a badge or
a chart row; never for the layout of a table, a card or a section. Arbitrary values
(`p-[13px]`) are not used for spacing at all.

Two roles get a token in `@theme` instead, because a header row and its body rows must
agree on both and nothing catches it when they drift:

- `px-gutter` (`--spacing-gutter`, 20px) — horizontal inset of any band, row or panel
  inside a card. One number, so a card header lines up with the column beneath it.
- `py-row` (`--spacing-row`, 10px) — vertical padding of a data-table row and of the
  header above it. 10px is not `py-2.5` under another name: it is a **decision** that these
  tables are read daily on a desktop with dozens of rows on screen, so density beats air.
  Right-aligned numeric columns are what carry scannability here, not row height.

Drift in these two is not cosmetic — it is a misalignment bug that passes typecheck, lint
and build, exactly like an unknown Tailwind class. It has happened twice: `TaxSaleItem`
rows carried `px-5` while their header carried none, and `movementsGrid` lost its only
flexible track when `instrument` was filtered out, leaving every track a fixed px so the
whole table hugged the left edge. `movements/columns.test.ts` pins the second shape — one
track per rendered column, exactly one flexible.

**A shared `ui/Table` component was considered and deliberately not built** (v0.5.2, still
true). Nine tables, too dissimilar to fold: two are real `<table>` elements and seven are
`div[role=row]` + `<ul>`; some sort, some are clickable rows, one is inline-editable.
Collapsing them behind one component before the shapes converge would be the abstraction
built for generality rather than for a second real case. Revisit when a tenth table wants
something the ninth already has — not before, and not as a tidy-up.

**What they do share is a stylesheet, not a component: `app/components/ui/table.ts`.**
`TABLE_SCROLL`, `TABLE_HEAD`, `TABLE_CELLS`, `TABLE_DIVIDER`, `TABLE_ROW` (cells +
divider) and `TABLE_NUM` are class strings every table imports. Compose them with the
route's own grid template — `` `${TABLE_ROW} ${GRID}` `` — and add the row height there,
since it is the one thing that legitimately differs per table. This is the spacing fix the
tokens above started: a header and its body rows cannot drift when both read the same
constant. Add a class string here before adding a prop to a component that does not exist.

Also declare `color-scheme` when adding native controls, so the OS draws the popup in the
right theme. The app currently has **no native `<select>` left** (`ui/Select.tsx`) and no
native date input (`ui/DatePicker.tsx`), so nothing exercises this today — which is
exactly why it is written down.

## Testing

Vitest. Everything pure is tested: `Money`, domain, projections, parsers, mappers, and
ingestion against injected fake repositories. `test:integration` runs `prisma migrate
deploy` against a temporary SQLite database — kept out of the default (unit) run because
it needs the generated Prisma client and shells out to `prisma`, and its `beforeAll` gets
a 120s `hookTimeout` because a cold pnpm + Prisma engine start blows past vitest's 10s
default (it silently did, on Windows, before that was set).

A regression only counts as fixed when a test covers it. The fee-treatment bug survived
for months because **no test used `fees ≠ 0`**.

**Nothing here renders a component**, so anything that only breaks in the browser needs a
real request to find. The `meta` locale bug (`data` vs `loaderData`) passed lint, typecheck,
build and 904 green tests; it took `curl` against `pnpm dev` to see the `<title>`. After a
change to copy, formatting or the shell, hit the routes and read the output — a green suite
is not evidence that a screen renders.

CI (GitHub Actions) runs lint + typecheck + build + test + test:integration on every push
and PR — the same five `pnpm verify:full` runs locally. All five must pass. `pnpm verify`
is the first four alone (no integration); `verify:full` is the gate to run before tagging
a release.

## Workflow

- Branches `feat/*`, `fix/*`, `chore/*` cut from `develop`. PRs target `develop`.
  (`feature/*` is the older prefix, still on the merged branches; match the commit type.)
  `main` is untouched until a release.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`).
- `CHANGELOG.md` follows Keep a Changelog, with an `[Unreleased]` section. Backticks
  only for what the user types: commands, flags, file names and extensions, environment
  variables. Never for example values, column names or internal codes — plain text reads
  better, and a reader cannot type those anyway.
- **The version is stated in two places and bumped by hand in both:** the
  `package.json` field and the `CHANGELOG.md` heading (`[Unreleased]` → `[x.y.z] - date`,
  plus the compare links at the foot of the file). The README status line carries no
  version on purpose; the badge reads it from `package.json`. Nothing links the two, so a
  release edits both in one commit or the repo starts disagreeing with itself. **Do not
  use `pnpm version`**: it commits and tags `package.json` alone, so the tag lands on a
  commit where the changelog still names the old version. Tag after the release commit,
  never before.
- No "Known limitations" sections in docs — open a GitHub issue instead.
- **A `v*.*.*` tag publishes `aritzmmartinez/quoin` to Docker Hub** (`docker.yml`, after
  `ci.yml` passes on the tag). The tag is a release to the public, not only a marker.

## Docker image

The image is **public**. Everything below was found by running it, not by reading it.

- **`.dockerignore` is a privacy boundary.** It excludes `data/`, `*.sqlite`, `*.csv`, `*.quoin.json`,
  `*.xlsx` and `.env*` even though no `COPY` names them, because one `COPY . .` would
  otherwise publish the portfolio. Keep it in step with `.gitignore`'s user-data block.
- **`openssl` must be in both the toolchain and runtime stages.** `node:24-trixie-slim` has none,
  and Prisma picks its schema-engine binary by the OpenSSL it detects. Without it, install
  downloads the `openssl-1.1.x` engine, `migrate deploy` then tries to fetch the right one
  into a root-owned `node_modules`, and the container never starts.
- **`CHECKPOINT_DISABLE=1` stays.** The Prisma CLI otherwise calls home (update check plus
  telemetry) on every `migrate`, which the entrypoint runs on every start.
- **The entrypoint backs up before it migrates, and only when something is pending.**
  `prisma migrate status` exits 1 on pending migrations and 0 when current (measured).
  Backing up on every start would rotate the 30-file window out during a restart loop.
  A failed backup stops the start: an unbackupable ledger is never migrated.
- **`prisma` and `tsx` are `dependencies`, not `devDependencies`.** The runtime stage installs
  `--prod`, and it needs `prisma migrate deploy` and `tsx` for `db-backup`. Move either back
  and the image builds fine and fails at start.
- **`*.sh` is forced to LF by `.gitattributes`.** With `core.autocrlf=true` a Windows
  checkout hands `sh` a `\r` on every line.
- **arm64 builds on a native runner (`ubuntu-24.04-arm`), never under QEMU.** Emulated on
  an amd64 runner it took over 25 minutes, nearly all of it `vite build`. Each platform
  pushes by digest and a `merge` job joins them; do not fold the matrix back into one
  `platforms: linux/amd64,linux/arm64` build to "simplify" it.
- **The image carries no npm, npx, corepack, yarn or pnpm, and its only CLI is
  `db-backup`** (`docker exec quoin db-backup`, `db-backup.sh`), which calls tsx directly.
  Adding another command to the image means copying its script and every file it
  imports, and `~/` imports need the tsconfig and `app/` too.
- **Both `FROM` lines pin `node:24-trixie-slim@sha256:…`** with a `Node n, Debian n`
  comment beside them, majors only: Dependabot's digest PR does not update the comment, so
  a patch version there goes stale. No `ARG` in a `FROM`: Dependabot cannot resolve it and
  stops opening the digest PRs that bring Debian fixes.
- **The Node major lives in `.node-version`** (CI reads it through `node-version-file`) and
  is bumped by hand, in one change, there, in both `FROM` lines, in `@types/node` and in the
  `engines.node` floor; Dependabot ignores its majors and `scripts/node-version.test.ts`
  fails while any of them disagree.
- **`docker.yml` fails on a Critical or High with a fix (`only-fixed`), not on every
  one.** A CVE with no fix anywhere would leave the pipeline red with nothing to do.
  Dependabot's PRs run with Dependabot's secrets, not the repository's, so the scan
  needs a read-only Docker Hub token in Settings → Secrets → Dependabot, never the
  publishing one. Without it every one of its PRs fails at the login.
- **`xlsx` is a tarball from cdn.sheetjs.com**, pinned by the lockfile's integrity;
  npm's last release is 0.18.5 and vulnerable. Dependabot ignores it, so a bump is by
  hand. Scout still lists two High against 0.20.3 because its source marks `>=0`; both
  were fixed in 0.19.3 and 0.20.2. Do not chase them by swapping the library — what
  `sheet_to_csv` renders is what the weight-scale detection reads.

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
