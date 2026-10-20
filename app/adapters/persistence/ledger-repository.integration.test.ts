import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import type { Instrument, LedgerEvent } from "~/core/domain";

let ledgerRepo: InstanceType<
  typeof import("./ledger-repository").PrismaLedgerRepository
>;
let instrumentRepo: InstanceType<
  typeof import("./instrument-repository").PrismaInstrumentRepository
>;
let disconnect: () => Promise<void>;

const tmpDir = "./.tmp";
const dbPath = `${tmpDir}/it-${Date.now()}.sqlite`;

const instrument: Instrument = {
  id: "IE00BK5BQT80",
  name: "Vanguard FTSE All-World UCITS ETF",
  type: "ETF",
  assetClass: "FUND",
  thesis: "CORE",
};

const event = (externalId: string): LedgerEvent => ({
  id: crypto.randomUUID(),
  ts: new Date("2025-01-01"),
  type: "BUY",
  instrumentId: instrument.id,
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
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: dbUrl },
  });

  const { PrismaLedgerRepository, PrismaInstrumentRepository, prisma } =
    await import("./index");
  ledgerRepo = new PrismaLedgerRepository();
  instrumentRepo = new PrismaInstrumentRepository();
  disconnect = () => prisma.$disconnect();

  await instrumentRepo.upsert([instrument]);
});

afterAll(async () => {
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

  it("refuses a ledger type the domain does not model", async () => {
    const { prisma } = await import("./index");

    await expect(
      prisma.ledgerEntry.create({
        data: {
          id: crypto.randomUUID(),
          ts: new Date("2025-01-01"),
          type: "FEE",
          grossAmount: "2.50",
          currency: "EUR",
          source: "MANUAL",
        },
      }),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("refuses a funding the domain does not model", async () => {
    const { prisma } = await import("./index");

    await expect(
      prisma.ledgerEntry.create({
        data: {
          id: crypto.randomUUID(),
          ts: new Date("2025-01-01"),
          type: "BUY",
          grossAmount: "2.50",
          currency: "EUR",
          source: "MANUAL",
          funding: "GIFT",
        },
      }),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("refuses an instrument thesis the domain does not model", async () => {
    const { prisma } = await import("./index");

    await expect(
      prisma.instrument.create({
        data: {
          id: "XS00TEST0099",
          name: "Synthetic Fund",
          type: "ETF",
          thesis: "SPECULATIVE",
        },
      }),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("has no currency column on Instrument", async () => {
    const { prisma } = await import("./index");

    const columns = await prisma.$queryRaw<{ name: string }[]>`
      SELECT name FROM pragma_table_info('Instrument')`;
    expect(columns.map((c) => c.name)).not.toContain("currency");
    expect(columns.map((c) => c.name)).toContain("thesis");
  });

  describe("FX provenance", () => {
    const entry = (over: Record<string, string | null>) => ({
      id: crypto.randomUUID(),
      ts: new Date("2026-04-02"),
      type: "BUY",
      instrumentId: instrument.id,
      quantity: "1",
      price: "100",
      grossAmount: "100",
      currency: "EUR",
      source: "MANUAL",
      ...over,
    });
    const converted = {
      currency: "USD",
      fxSource: "ECB",
      fxDate: "2026-04-02",
      fxRate: "1.1525",
      fxDirection: "QUOTE_PER_BASE",
    };

    it("books an appended event as already in euros, its own original amount", async () => {
      const { prisma } = await import("./index");
      await ledgerRepo.append([event("fx-1")]);

      expect(
        await prisma.ledgerEntry.findFirst({
          where: { externalId: "fx-1" },
          select: {
            fxSource: true,
            fxDate: true,
            fxRate: true,
            fxDirection: true,
            originalAmount: true,
            originalCurrency: true,
          },
        }),
      ).toEqual({
        fxSource: "IDENTITY",
        fxDate: null,
        fxRate: null,
        fxDirection: null,
        originalAmount: "100",
        originalCurrency: "EUR",
      });
    });

    it.each([
      ["source", { ...converted, fxSource: "GUESS" }],
      ["direction", { ...converted, fxDirection: "SIDEWAYS" }],
    ])("refuses a row with an unknown %s", async (_case, over) => {
      const { prisma } = await import("./index");
      await expect(
        prisma.ledgerEntry.create({ data: entry(over) }),
      ).rejects.toThrow(/CHECK constraint failed/);
    });

    it("refuses to append an event in another currency counted one-to-one", async () => {
      await expect(
        ledgerRepo.append([{ ...event("fx-usd"), currency: "USD" }]),
      ).rejects.toThrow(/needs a conversion/);
    });

    it("backfills a row stored before the migration with its own amount", async () => {
      const { prisma } = await import("./index");
      const sql = readFileSync(
        "prisma/migrations/20261021120000_ledger_fx_provenance/migration.sql",
        "utf8",
      );
      const backfill = /UPDATE "LedgerEntry"[\s\S]*?;/.exec(sql)?.[0];
      expect(backfill).toBeDefined();

      const legacy = await prisma.ledgerEntry.create({
        data: entry({ grossAmount: "42.10", originalAmount: null }),
      });
      await prisma.$executeRawUnsafe(backfill!);

      expect(
        await prisma.ledgerEntry.findUnique({
          where: { id: legacy.id },
          select: { originalAmount: true, originalCurrency: true },
        }),
      ).toEqual({ originalAmount: "42.10", originalCurrency: "EUR" });
    });

    it("keeps every CHECK on the table after the migration", async () => {
      const { prisma } = await import("./index");
      const [table] = await prisma.$queryRaw<{ sql: string }[]>`
        SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'LedgerEntry'`;

      for (const name of [
        "LedgerEntry_type_check",
        "LedgerEntry_funding_check",
        "LedgerEntry_fxDirection_check",
        "LedgerEntry_fxSource_check",
      ]) {
        expect(table?.sql).toContain(name);
      }
    });
  });

  it("markInKind changes funding and nothing else, once, and never back", async () => {
    const { prisma } = await import("./index");
    await ledgerRepo.append([event("m-1"), event("m-2")]);
    const before = await prisma.ledgerEntry.findMany({
      where: { externalId: { in: ["m-1", "m-2"] } },
      orderBy: { externalId: "asc" },
    });

    const inKind = { ...event("m-1"), grossAmount: "999", funding: "IN_KIND" };
    expect(await ledgerRepo.markInKind([inKind as LedgerEvent])).toBe(1);
    expect(await ledgerRepo.markInKind([inKind as LedgerEvent])).toBe(0);
    expect(await ledgerRepo.markInKind([event("m-1")])).toBe(0);

    const after = await prisma.ledgerEntry.findMany({
      where: { externalId: { in: ["m-1", "m-2"] } },
      orderBy: { externalId: "asc" },
    });
    expect(after.map((row) => row.funding)).toEqual(["IN_KIND", "CASH"]);
    expect(after.map(({ funding: _f, ...rest }) => rest)).toEqual(
      before.map(({ funding: _f, ...rest }) => rest),
    );
  });

  it("round-trips an in-kind acquisition", async () => {
    await ledgerRepo.append([
      { ...event("k-1"), funding: "IN_KIND" } as LedgerEvent,
    ]);
    const stored = (await ledgerRepo.list()).find(
      (e) => e.externalId === "k-1",
    );
    expect(stored && "funding" in stored && stored.funding).toBe("IN_KIND");
  });
});
