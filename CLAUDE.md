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
pnpm ingest --broker=<tr|kraken> <file>
pnpm prices:sync                  # quote every mapped instrument
pnpm prices:map <ISIN> <SYMBOL>   # set / show / --clear a Yahoo symbol
pnpm prices:backfill [ISIN] [1y|2y|5y|10y|max]   # daily history, default 5y
```

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
- **adapters** — persistence (Prisma repositories), market data (Yahoo), ingestion (CSV).
  Keep parsing **pure and separately tested** from the I/O that feeds it
  (`parseYahooChart`, `parseYahooChartHistory` are pure; the provider does the fetching).
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

## Privacy and the no-clobber rule

`Instrument.quoteSymbol`, `exposureKind` and `exposureLeafId` are set by CLI and live
**only** in the local, gitignored SQLite database. Never commit symbols, ISINs, quantities,
holdings or broker exports — this repo is public and that data would publish the author's
portfolio. `*.csv` is gitignored.

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
- **`computeExposures` takes `Map<instrumentId, WeightedLeaf[]>`** — an array, always. Phase
  one hands it one leaf of weight 1; issuer look-through will hand it many. The resolver is
  the seam that changes; the projection is not.
- **Contributions are kept, not summed.** "NVIDIA is 11.6%" is not actionable; "9.9% direct,
  1.4% via FTSE" is. The provenance is lost in the fold, so the fold keeps it.
  `weightInParent: null` marks a direct holding, distinct from a 100% constituent.
- **Leaf totals are derived (`leafTotal`), never stored.** Storing both invites the day they
  disagree — which is exactly how the fee bug happened.

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

## Fiscal

Always the **Bizkaia foral regime** (Norma Foral de IRPF de Bizkaia). Never régimen común.

## CSV ingestion

papaparse behaves differently under ESM/tsx than under CJS. **Both** guards are required
and are applied defensively to every adapter:

1. `skipEmptyLines: 'greedy'`
2. a pre-validation filter dropping any row without a `type` field

Append is idempotent: dedup by `source` + `externalId`.

## URL as state

Sort order (Cartera) and chart range (Resumen) live in **URL search params**, written by
the UI and read by the **loader**. No context, no state lifting, and the view stays
shareable. A route opts into the header's range selector with `handle = { range: true }`;
`handle.title` sets the header title.

## Testing

Vitest. Everything pure is tested: `Money`, domain, projections, parsers, mappers, and
ingestion against injected fake repositories. `test:integration` runs `prisma migrate
deploy` against a temporary SQLite database.

A regression only counts as fixed when a test covers it. The fee-treatment bug survived
for months because **no test used `fees ≠ 0`**.

CI (GitHub Actions) runs lint + typecheck + build + test on every push and PR. All four
must pass.

## Workflow

- Branches `feature/*`, `fix/*`, `chore/*` cut from `develop`. PRs target `develop`.
  `main` is untouched until a release.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`).
- `CHANGELOG.md` follows Keep a Changelog, with an `[Unreleased]` section.
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
