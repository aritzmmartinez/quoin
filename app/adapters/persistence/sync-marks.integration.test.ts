import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { originOf } from "~/core/sync";

let persistence: typeof import("./index");

const tmpDir = "./.tmp-sync-marks";
const dbPath = `${tmpDir}/it-${Date.now()}.sqlite`;

beforeAll(async () => {
  mkdirSync(tmpDir, { recursive: true });
  const dbUrl = `file:${dbPath}`;
  process.env.DATABASE_URL = dbUrl;
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: dbUrl },
  });
  persistence = await import("./index");
  await new persistence.PrismaInstrumentRepository().upsert([
    { id: "IE00TEST0001", name: "Test Fund", type: "ETF", thesis: "CORE" },
  ]);
});

afterAll(async () => {
  if (persistence) await persistence.prisma.$disconnect();
  rmSync(tmpDir, { recursive: true, force: true });
});

const ID = "IE00TEST0001";
const marks = () =>
  persistence.prisma.instrument.findUniqueOrThrow({
    where: { id: ID },
    select: {
      quoteSymbolHlc: true,
      exposureHlc: true,
      terHlc: true,
      hedgedToBaseHlc: true,
      thesisHlc: true,
    },
  });
const device = () =>
  persistence.prisma.syncDevice.findUniqueOrThrow({ where: { id: 1 } });

describe("sync marks (integration)", () => {
  it("gives the database a device id of its own, once", async () => {
    const row = await device();
    expect(row.deviceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(row.lastHlc).toBeNull();
    await expect(
      persistence.prisma.$executeRawUnsafe(
        `INSERT INTO "SyncDevice" ("id", "deviceId") VALUES (2, 'other')`,
      ),
    ).rejects.toThrow();
  });

  it("marks a hand-set field when it changes, with this device as origin, and not when it does not", async () => {
    const repo = new persistence.PrismaInstrumentRepository();
    expect(await marks()).toEqual({
      quoteSymbolHlc: null,
      exposureHlc: null,
      terHlc: null,
      hedgedToBaseHlc: null,
      thesisHlc: null,
    });

    await repo.setTer(ID, "0.0022");
    const first = await marks();
    expect(first.terHlc).not.toBeNull();
    expect(originOf(first.terHlc!)).toBe((await device()).deviceId);
    expect((await device()).lastHlc).toBe(first.terHlc);

    await repo.setTer(ID, "0.0022");
    await repo.setThesis(ID, "CORE");
    await repo.setHedgedToBase(ID, false);
    await repo.setExposure(ID, null, null);
    expect(await marks()).toEqual(first);

    await repo.setTer(ID, "0.0025");
    expect((await marks()).terHlc! > first.terHlc!).toBe(true);
  });

  it("marks the exposure pair once, whichever half changes", async () => {
    const repo = new persistence.PrismaInstrumentRepository();
    await repo.setExposure(ID, "COMMODITY", "XAU");
    const kind = (await marks()).exposureHlc!;
    await repo.setExposure(ID, "COMMODITY", "XAG");
    const leaf = (await marks()).exposureHlc!;

    expect(leaf > kind).toBe(true);
    await repo.setExposure(ID, "COMMODITY", "XAG");
    expect((await marks()).exposureHlc).toBe(leaf);
  });

  it("marks a symbol changed through a history replacement, and not one kept", async () => {
    const prices = new persistence.PrismaPriceRepository();
    await prices.replaceHistory(ID, [], { quoteSymbol: "TEST.DE" });
    const changed = (await marks()).quoteSymbolHlc;
    expect(changed).not.toBeNull();

    await prices.replaceHistory(ID, [], { quoteSymbol: "TEST.DE" });
    expect((await marks()).quoteSymbolHlc).toBe(changed);
  });

  it("does not mark a residence that is written unchanged", async () => {
    await new persistence.PrismaSettingsRepository().setResidence("bizkaia");
    const row = await persistence.prisma.settings.findUniqueOrThrow({
      where: { id: 1 },
    });
    expect(row.residenceHlc).toBeNull();
  });

  it("leaves a tombstone where a target version was deleted", async () => {
    const repo = new persistence.PrismaTargetRepository();
    await repo.create({
      id: "v1",
      name: "v1",
      activeFrom: "2026-11-01",
      note: null,
      createdAt: new Date("2026-10-28T10:00:00Z"),
      lines: [{ instrumentId: ID, monthlyAmount: "300" }],
    });
    await repo.remove("v1");

    expect(await repo.list()).toEqual([]);
    const [tombstone] = await persistence.prisma.syncTombstone.findMany();
    expect(tombstone).toMatchObject({
      entity: persistence.TARGET_TOMBSTONE,
      key: "v1",
    });
    expect(tombstone?.hlc).toBe((await device()).lastHlc);
  });

  it("stores a composition as one marked block, and marks nothing when the same file arrives again", async () => {
    const repo = new persistence.PrismaHoldingsRepository();
    const rows = [
      {
        instrumentId: ID,
        identity: "US00TEST0101",
        identityKind: "ISIN" as const,
        name: "Alpha Corp",
        weight: "0.6",
      },
      {
        instrumentId: ID,
        identity: "BETA.US",
        identityKind: "TICKER" as const,
        name: "Beta Inc",
        weight: "0.4",
      },
    ];
    const block = { asOf: "2026-09-30", asOfInferred: false };

    expect(await repo.replaceFor(ID, rows, block)).toBe(2);
    const first = await persistence.prisma.etfHoldingBlock.findUniqueOrThrow({
      where: { instrumentId: ID },
    });
    expect(first).toMatchObject(block);
    expect(first.hlc).not.toBeNull();

    await repo.replaceFor(ID, [...rows].reverse(), block);
    expect(
      (await persistence.prisma.etfHoldingBlock.findUniqueOrThrow({
        where: { instrumentId: ID },
      })).hlc,
    ).toBe(first.hlc);

    await repo.replaceFor(ID, rows.slice(0, 1), {
      asOf: "2026-10-28",
      asOfInferred: true,
    });
    expect(await repo.blocks()).toEqual(
      new Map([[ID, { asOf: "2026-10-28", asOfInferred: true }]]),
    );
    expect((await repo.forInstrument(ID)).map((h) => h.identity)).toEqual([
      "US00TEST0101",
    ]);
  });

  it("keeps the block of a file with no date when the same file arrives again, and replaces it when the content differs", async () => {
    const FUND = "IE00TEST0002";
    await new persistence.PrismaInstrumentRepository().upsert([
      { id: FUND, name: "Undated Fund", type: "ETF", thesis: "CORE" },
    ]);
    const repo = new persistence.PrismaHoldingsRepository();
    const row = (identity: string, weight: string) => ({
      instrumentId: FUND,
      identity,
      identityKind: "ISIN" as const,
      name: identity,
      weight,
    });
    const rows = [row("US00TEST0201", "0.7"), row("US00TEST0202", "0.3")];
    const block = () =>
      persistence.prisma.etfHoldingBlock.findUniqueOrThrow({
        where: { instrumentId: FUND },
      });

    await repo.replaceFor(FUND, rows, { asOf: "2026-07-17", asOfInferred: true });
    const first = await block();
    const lastHlc = (await device()).lastHlc;

    await repo.replaceFor(FUND, rows, { asOf: "2026-10-28", asOfInferred: true });
    expect(await block()).toEqual(first);
    expect((await device()).lastHlc).toBe(lastHlc);

    const changed = [row("US00TEST0201", "0.6"), row("US00TEST0202", "0.4")];
    await repo.replaceFor(FUND, changed, { asOf: "2026-10-28", asOfInferred: true });
    const second = await block();
    expect(second).toMatchObject({ asOf: "2026-10-28", asOfInferred: true });
    expect(second.hlc! > first.hlc!).toBe(true);
    expect((await repo.forInstrument(FUND)).map((h) => h.weight).sort()).toEqual([
      "0.4",
      "0.6",
    ]);
  });
});
