# Quoin

A personal, open-source, local-first investment platform. Self-hosted: your data
never leaves your machine.

Quoin tracks a buy-and-hold portfolio (broad-index ETFs plus a few single names) and,
later, a small trading sleeve — with allocation analysis, true look-through exposure,
and support for the Bizkaia *foral* tax regime that off-the-shelf trackers ignore.
The goal isn't to trade: it's to **understand** a portfolio, and to double as a
learning project.

> **Status: early stage, actively built.** The immutable ledger, core domain
> (`Money`, event types, `computePositions` with average cost), CSV ingestion
> (Trade Republic + Kraken), a Yahoo price provider with daily history, the app shell
> and the summary / holdings / movements / asset-detail / instruments / allocation
> screens are in place. Look-through works end to end: fund compositions are imported
> from whatever CSV the issuer publishes, and holdings are matched across issuers by
> canonical identity. The tax module is next — see the roadmap.

## Why

Existing trackers do charts and dividends well, but none of them:

- model a **jurisdiction-pluggable tax engine** (Bizkaia foral rules as a first implementation);
- compute **true look-through exposure** — your real single-name weight counting holdings
  inside each ETF, not just direct positions;
- stay **local-first and self-hosted** with zero recurring cost, so the data you own
  actually stays yours and survives a broker or country change.

Quoin is built around an **immutable ledger** as the single source of truth: positions,
cost basis, P&L, allocation and look-through are all pure projections derived from it.

## Tech stack

React Router 8 (SSR) · React 19 · TypeScript (strict, with `noUncheckedIndexedAccess`) ·
Tailwind v4 · Lucide · Zod · Recharts · Papa Parse ·
Prisma 7 + SQLite (better-sqlite3 driver adapter) · decimal.js · Vitest.

## Getting started

Requirements: Node.js 24+ and pnpm.

```bash
cp .env.example .env    # DATABASE_URL -> data/quoin.sqlite
pnpm install            # builds better-sqlite3 + generates the Prisma client
pnpm run db:migrate     # creates the database and the first migration
pnpm run dev            # http://localhost:5173
```

Import your data and fetch prices:

```bash
pnpm ingest --broker=trade-republic path/to/export.csv   # CSV -> ledger (idempotent)
pnpm ingest --broker=kraken path/to/ledgers.csv
pnpm prices:map <ISIN> <SYMBOL>   # map an instrument to a Yahoo symbol, e.g. VWCE.DE
pnpm prices:sync                  # fetch quotes for mapped instruments -> price snapshots
pnpm prices:backfill [ISIN] [1y|2y|5y|10y|max]   # daily price history (default 5y)
pnpm exposure:map                 # list how every instrument resolves for look-through
pnpm exposure:map <ISIN> <KIND> [LEAF]           # e.g. XS2183935274 COMMODITY XAU
pnpm identity:resolve             # give holdings a canonical id so duplicates merge
pnpm identity:resolve --report    # what merged, and what is still ambiguous
```

Fund compositions are imported from the **Instrumentos** screen: drop the issuer's
holdings CSV onto the fund's row. One parser handles every issuer — the weight column
is found by being the one that adds up to about 100, so it survives a different
language, layout or number format without a rule per provider. There is no command
for it on purpose.

Quote symbols and exposure classifications live only in your local database (never in
the repo), so a public clone never discloses your holdings. Prefer EUR venues (`.DE`,
`.AS`, `.MC`) to avoid FX for now.

`exposure:map` exists because brokers do not report what a fund actually is: Trade
Republic labels both equity ETFs and physical-gold ETCs as `FUND`, so an ETC arrives
indistinguishable from an index fund. Stocks and crypto resolve from their type
automatically; ETCs and bond funds need one command each, once.

`identity:resolve` exists because issuers disagree on what to publish. Some list an
ISIN, others only a ticker, and they hold hundreds of the same companies — so the same
business arrives as `US67066G1040` from one fund and `NVDA.US` from another and counts
twice. Both are mapped to a share-class FIGI via [OpenFIGI](https://www.openfigi.com/),
which links one share class across countries. Set `OPENFIGI_API_KEY` in `.env` for a
free and far higher rate limit; without one it still works, just slower. Anything that
cannot be resolved keeps its raw identity: it will not merge with its twin, but it
still appears with the right value.

Share classes are deliberately **not** merged. `GOOG` and `GOOGL`, or Berkshire A and
B, are separate securities with separate ISINs and separate prices; reporting them
apart is more correct than tidying them together.

Other scripts:

```bash
pnpm run typecheck      # react-router typegen + tsc
pnpm run lint           # eslint (includes the layer boundaries)
pnpm run build          # production build
pnpm run db:generate    # regenerate the Prisma client after a schema change
pnpm run db:studio      # Prisma Studio (GUI to inspect the data)
pnpm test               # Vitest (pure domain / projection / mapper tests)
pnpm run test:integration   # migrations against a temporary SQLite database
```

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). In short: a single React Router app
with `app -> adapters -> core` layers enforced by lint; money is always a string operated
on with decimal.js; data and secrets are never committed.

## Roadmap

- [x] Skeleton: layered structure, design tokens, lint boundaries
- [x] Persistence: Prisma ledger schema (Instrument + LedgerEntry) and first migration
- [x] Core domain: `Money`, ledger event types, repository ports, `computePositions` (average cost)
- [x] CSV import: Trade Republic + Kraken adapters (filter card spending, dedup by transaction id)
- [x] Holdings screen (sortable table, expandable per-position detail)
- [x] Market data: Yahoo price provider, `PriceSnapshot` persistence, `prices:sync`, `prices:backfill`
- [x] Surface market columns (value, unrealized P&L, weight) + price freshness in the UI
- [x] Asset-detail view (price chart, invested-vs-value, TWR/MWR)
- [x] App shell (sidebar / bottom nav, theme toggle) and summary screen
- [x] Movements screen (full ledger, URL-driven pagination)
- [x] Exposure model: leaves, intrinsic resolution, `exposure:map`
- [x] Instruments screen: classify exposure, import fund compositions by dropping a CSV
- [x] Generic holdings parser: one parser for every issuer, no per-provider rules
- [x] Allocation screen: true look-through, direct vs via-fund attribution, concentration threshold
- [x] Canonical identity via OpenFIGI, so a company held directly and inside a fund counts once
- [ ] Read `.xlsx` holdings directly (most issuers publish Excel, not CSV)
- [ ] Trading sleeve, watchlist and trade journal
- [ ] Bizkaia foral tax module (FIFO lots)
- [ ] DCF valuation module

## License

© 2026 Aritz Martínez. Licensed under [AGPL-3.0-only](LICENSE) — you may use, fork and
even run it as a service, but any derivative (including a hosted service) must remain
open under the same license.
