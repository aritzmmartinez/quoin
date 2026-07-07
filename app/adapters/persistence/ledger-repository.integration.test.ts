import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import type { Instrument, LedgerEvent } from "~/core/domain";

// Integration test: runs against a real (temporary) SQLite database provisioned with
// your real migrations (`prisma migrate deploy`). Excluded from the default unit run;
// execute with `pnpm test:integration`. Requires the generated Prisma client and
// better-sqlite3 (run it after `pnpm install`).

let ledgerRepo: InstanceType<
  typeof import("./ledger-repository").PrismaLedgerRepository
>;
let instrumentRepo: InstanceType<
  typeof import("./instrument-repository").PrismaInstrumentRepository
>;
let disconnect: () => Promise<void>;

// Project-relative path (Prisma resolves it from the project root) avoids the absolute
// Windows path / file: URL issues a temp-dir path would cause.
const tmpDir = "./.tmp";
const dbPath = `${tmpDir}/it-${Date.now()}.sqlite`;

const instrument: Instrument = {
  id: "IE00BK5BQT80",
  name: "Vanguard FTSE All-World UCITS ETF",
  type: "ETF",
  currency: "EUR",
  assetClass: "FUND",
};

const event = (externalId: string): LedgerEvent => ({
  id: crypto.randomUUID(),
  ts: new Date("2025-01-01"),
  type: "BUY",
  instrumentId: instrument.id,
  sleeve: "CORE",
  quantity: "1",
  price: "100",
  grossAmount: "100",
  fees: "0",
  currency: "EUR",
  fxToBase: "1",
  account: "trade-republic",
  source: "TR_CSV",
  externalId,
  note: null,
});

beforeAll(async () => {
  mkdirSync(tmpDir, { recursive: true });
  const dbUrl = `file:${dbPath}`;
  process.env.DATABASE_URL = dbUrl;
  // Apply the committed migrations to the temp database (client already generated).
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: dbUrl },
  });

  const { PrismaLedgerRepository, PrismaInstrumentRepository, prisma } =
    await import("./index");
  ledgerRepo = new PrismaLedgerRepository();
  instrumentRepo = new PrismaInstrumentRepository();
  disconnect = () => prisma.$disconnect();

  // Real ingestion flow in miniature: upsert instruments before appending entries.
  await instrumentRepo.upsert([instrument]);
});

afterAll(async () => {
  // Close the SQLite handle before deleting the file (Windows would raise EPERM).
  if (disconnect) await disconnect();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("PrismaLedgerRepository (integration)", () => {
  it("appends events and reads them back unchanged", async () => {
    const result = await ledgerRepo.append([event("a-1"), event("a-2")]);
    expect(result).toEqual({ inserted: 2, skipped: 0 });

    const events = await ledgerRepo.list();
    expect(events).toHaveLength(2);
    expect(events[0]!.grossAmount).toBe("100");
  });

  it("is idempotent: re-appending the same events skips them", async () => {
    const result = await ledgerRepo.append([event("a-1"), event("a-2")]);
    expect(result).toEqual({ inserted: 0, skipped: 2 });
  });
});
