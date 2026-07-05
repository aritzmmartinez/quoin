# Quoin

A personal, open-source, local-first investment platform. Self-hosted: your data
never leaves your machine.

Quoin tracks a buy-and-hold portquoin (broad-index ETFs plus a few single names) and,
later, a small trading sleeve — with allocation analysis, true look-through exposure,
and support for the Bizkaia *foral* tax regime that off-the-shelf trackers ignore.
The goal isn't to trade: it's to **understand** a portquoin, and to double as a
learning project.

> **Status: early stage.** Layered structure, design tokens, lint-enforced boundaries
> and the Prisma ledger schema are in place. No business logic yet — see the roadmap.

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

React Router 8 (SSR) · React 19 · TypeScript (strict) · Tailwind v4 ·
Lucide · React Hook Form + Zod · Sileo (toasts) · Recharts + Lightweight Charts ·
Prisma 7 + SQLite (better-sqlite3 driver adapter) · decimal.js.

## Getting started

Requirements: Node.js 22+ and pnpm.

```bash
cp .env.example .env    # DATABASE_URL -> data/quoin.sqlite
pnpm install            # builds better-sqlite3 + generates the Prisma client
pnpm run db:migrate     # creates the database and the first migration
pnpm run dev            # http://localhost:5173
```

Other scripts:

```bash
pnpm run typecheck      # react-router typegen + tsc
pnpm run lint           # eslint (includes the layer boundaries)
pnpm run build          # production build
pnpm run db:studio      # Prisma Studio (GUI to inspect the data)
```

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). In short: a single React Router app
with `app -> adapters -> core` layers enforced by lint; money is always a string operated
on with decimal.js; data and secrets are never committed.

## Roadmap

- [x] Skeleton: layered structure, design tokens, lint boundaries
- [x] Persistence: Prisma ledger schema (Instrument + LedgerEntry) and first migration
- [ ] Core domain: `Money`, ledger event types, `Repository` port, `computePositions`
- [ ] Trade Republic CSV import adapter (filter card spending, dedup by transaction_id)
- [ ] Dashboard, holdings, allocation + look-through
- [ ] Trading sleeve, watchlist and trade journal
- [ ] Bizkaia foral tax module
- [ ] DCF valuation module

## License

© 2026 Aritz Martínez. Licensed under [AGPL-3.0-only](LICENSE) — you may use, fork and
even run it as a service, but any derivative (including a hosted service) must remain
open under the same license.
