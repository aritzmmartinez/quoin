# Architecture — Quoin

Personal, self-hosted, local-first investment webapp. Open source.
Zero hosting cost, minimal maintenance, portable across a future relocation.

## Project shape (decision B)

**A single React Router app** (framework mode, SSR) with **folder boundaries**, not a
monorepo. `core` is pure TypeScript with no framework dependency, so extracting it into a
package the day there's a second consumer (CLI, Tauri) is mechanical. Setting up workspaces
now would pay complexity for portability not yet exercised.

## Layers and dependency direction

```
app (routes, components, root)  ->  adapters  ->  core
```

The direction points inward and is **enforced by lint** (`no-restricted-imports` per folder,
no heavy plugins):

- `app/core/**`     pure domain. MUST NOT import from `adapters` or `app`.
- `app/adapters/**` implement core's ports. May use `core`, NOT `app`.
- `app/**` (rest)   may use everything.

Convention: internal imports always use the `~/...` alias.

### core
- `domain/`      value objects (Money as string + decimal.js), ledger event types, exposure leaves + `resolveIntrinsic`
- `ports/`       interfaces: `LedgerRepository`, `InstrumentRepository`, `MarketDataProvider`, `PriceRepository` (planned: `FxProvider`, `TaxJurisdiction`)
- `projections/` pure functions: `computePositions` (average cost), `computeTradeMeta`, `computeReturns`, `computeAllocation`, `computeExposures` (look-through) (planned: FIFO lots)
- `tax/`         TaxJurisdiction implementations (bizkaia, common, ...)

### adapters
- `ingestion/`   `TradeRepublicCsvAdapter` + `KrakenCsvAdapter` (CSV -> events; filter card spending / non-BTC crypto; dedup by transaction id)
- `persistence/` Prisma 7 + SQLite (schema, generated client, ledger/instrument/price repositories)
- `marketdata/`  `YahooMarketDataProvider` behind the `MarketDataProvider` port; `quoteSymbol` per instrument (local DB only)
- `fx/`          (planned) exchange rates for non-EUR quotes

## Persistence (Prisma 7 + SQLite)

- **Prisma 7** uses a query compiler and **requires a driver adapter**: SQLite uses
  `@prisma/adapter-better-sqlite3` + `better-sqlite3` (native module; compiled on install).
- ESM `prisma-client` generator with `output` inside the persistence layer
  (`app/adapters/persistence/generated/`, gitignored). The client lives where it can be used,
  and the lint boundary keeps `core` from importing it.
- The connection URL lives in **`prisma.config.ts`** (Prisma 7), not in the datasource block.
- **Models**: `Instrument` (master, key = ISIN or symbol; `quoteSymbol` for price lookups and
  `exposureKind`/`exposureLeafId` for look-through — all three set by CLI, never by ingestion,
  and omitted from `InstrumentWriteData` at the type level so a re-import cannot clobber them), `LedgerEntry` (immutable ledger), and `PriceSnapshot` (append-only price history,
  `@@unique([instrumentId, asOf])`). Every amount/quantity/price is a `String` (decimal) ->
  operated on with decimal.js. `@@unique([source, externalId])` makes ingestion idempotent.
- Repositories implement core's ports (`LedgerRepository`, `InstrumentRepository`,
  `PriceRepository`); the loader reads snapshots persisted by `prices:sync` and never hits the
  network in a request.

### Database setup

```bash
cp .env.example .env    # DATABASE_URL -> data/quoin.sqlite
pnpm install            # builds better-sqlite3 + generates the client (postinstall)
pnpm run db:migrate     # creates the database and the first migration
pnpm run db:studio      # (optional) GUI to inspect the data
```

## Non-negotiable principles

- **Ledger as the source of truth.** Immutable transactions; everything else is derived.
  Pragmatic implementation (ledger + derived queries), no CQRS.
- **Money as a string + decimal.js.** Never `number`. Never the ORM's Decimal on SQLite.
- **ISIN as the instrument key** (an identifier; crypto uses its symbol).
- **Fragile integrations behind a port**, with manual/CSV import as the always-works fallback.

## Data and secrets (public repo)

The code is public; data and credentials, NEVER. `data/`, `*.sqlite`, `*.csv`, `.env` and
`credentials*` are gitignored. `.env.example` documents the variables without values.
Quote symbols (which reveal holdings) live only in the local DB, never in the repo.

## Stack

React Router 8 (SSR) · React 19 · strict TypeScript · Tailwind v4 ·
Lucide · React Hook Form + Zod · Sileo (toasts) · Recharts + Lightweight Charts ·
SQLite + Prisma 7 (better-sqlite3 adapter) · decimal.js.
