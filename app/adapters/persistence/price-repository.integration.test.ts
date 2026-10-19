import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Instrument } from "~/core/domain";

type Client = typeof import("./db.server").prisma;

let prisma: Client;
let priceRepo: InstanceType<
  typeof import("./price-repository").PrismaPriceRepository
>;

const tmpDir = "./.tmp-prices";
const dbPath = `${tmpDir}/it-${Date.now()}.sqlite`;

const instrument = (id: string): Instrument => ({
  id,
  name: `Synthetic ${id}`,
  type: "ETF",
  currency: "EUR",
  assetClass: "FUND",
  thesis: "CORE",
});

const snapshot = (
  instrumentId: string,
  asOf: string,
  price: string,
  createdAt: string,
  currency = "EUR",
) =>
  prisma.priceSnapshot.create({
    data: {
      instrumentId,
      price,
      currency,
      asOf: new Date(asOf),
      source: "TEST",
      createdAt: new Date(createdAt),
    },
  });

beforeAll(async () => {
  mkdirSync(tmpDir, { recursive: true });
  const dbUrl = `file:${dbPath}`;
  process.env.DATABASE_URL = dbUrl;
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: dbUrl },
  });

  const persistence = await import("./index");
  prisma = persistence.prisma;
  priceRepo = new persistence.PrismaPriceRepository();
  await new persistence.PrismaInstrumentRepository().upsert([
    instrument("XS00TEST0001"),
    instrument("XS00TEST0002"),
    instrument("XS00TEST0003"),
  ]);
});

beforeEach(async () => {
  await prisma.priceSnapshot.deleteMany();
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("PrismaPriceRepository.latest (integration)", () => {
  it("returns an empty map when there are no snapshots", async () => {
    expect(await priceRepo.latest()).toEqual(new Map());
  });

  it("returns exactly one snapshot per instrument, the newest by asOf", async () => {
    await snapshot(
      "XS00TEST0001",
      "2026-01-05T17:30:00Z",
      "10",
      "2026-01-05T18:00:00Z",
    );
    await snapshot(
      "XS00TEST0001",
      "2026-01-07T17:30:00Z",
      "12",
      "2026-01-07T18:00:00Z",
    );
    await snapshot(
      "XS00TEST0001",
      "2026-01-06T17:30:00Z",
      "11",
      "2026-01-06T18:00:00Z",
    );
    await snapshot(
      "XS00TEST0002",
      "2026-01-02T17:30:00Z",
      "200",
      "2026-01-02T18:00:00Z",
    );

    const latest = await priceRepo.latest();

    expect([...latest.keys()].sort()).toEqual(["XS00TEST0001", "XS00TEST0002"]);
    expect(latest.get("XS00TEST0001")).toEqual({
      instrumentId: "XS00TEST0001",
      price: "12",
      currency: "EUR",
      asOf: new Date("2026-01-07T17:30:00Z"),
      source: "TEST",
    });
    expect(latest.get("XS00TEST0002")?.price).toBe("200");
  });

  it("resolves by market time, not sync time: a backfilled old candle never wins", async () => {
    await snapshot(
      "XS00TEST0001",
      "2026-03-10T17:30:00Z",
      "50",
      "2026-03-10T18:00:00Z",
    );
    await snapshot(
      "XS00TEST0001",
      "2021-03-10T17:30:00Z",
      "20",
      "2026-06-01T09:00:00Z",
    );
    await snapshot(
      "XS00TEST0001",
      "2021-03-11T17:30:00Z",
      "21",
      "2026-06-01T09:00:00Z",
    );

    const latest = await priceRepo.latest();

    expect(latest.get("XS00TEST0001")?.asOf).toEqual(
      new Date("2026-03-10T17:30:00Z"),
    );
    expect(latest.get("XS00TEST0001")?.price).toBe("50");
  });

  it("cannot tie on asOf: a second snapshot at the same instant is refused", async () => {
    await snapshot(
      "XS00TEST0001",
      "2026-01-07T17:30:00Z",
      "12",
      "2026-01-07T18:00:00Z",
    );
    await expect(
      snapshot(
        "XS00TEST0001",
        "2026-01-07T17:30:00Z",
        "13",
        "2026-01-08T09:00:00Z",
      ),
    ).rejects.toThrow();
  });

  it("keeps the newest snapshot whatever its currency", async () => {
    await snapshot(
      "XS00TEST0003",
      "2026-01-05T17:30:00Z",
      "90",
      "2026-01-05T18:00:00Z",
      "EUR",
    );
    await snapshot(
      "XS00TEST0003",
      "2026-01-06T17:30:00Z",
      "99",
      "2026-01-06T18:00:00Z",
      "USD",
    );

    expect((await priceRepo.latest()).get("XS00TEST0003")).toMatchObject({
      price: "99",
      currency: "USD",
    });
  });

  it("reports an instrument with a single snapshot", async () => {
    await snapshot(
      "XS00TEST0002",
      "2025-12-31T17:30:00Z",
      "7",
      "2025-12-31T18:00:00Z",
    );
    expect((await priceRepo.latest()).get("XS00TEST0002")?.price).toBe("7");
  });
});

describe("PrismaPriceRepository.historyFor (integration)", () => {
  const seedHistory = async () => {
    await snapshot(
      "XS00TEST0001",
      "2026-01-02T17:30:00Z",
      "10",
      "2026-01-02T18:00:00Z",
    );
    await snapshot(
      "XS00TEST0001",
      "2026-01-05T17:30:00Z",
      "11",
      "2026-01-05T18:00:00Z",
    );
    await snapshot(
      "XS00TEST0001",
      "2026-01-09T17:30:00Z",
      "12",
      "2026-01-09T18:00:00Z",
    );
    await snapshot(
      "XS00TEST0001",
      "2026-01-12T17:30:00Z",
      "13",
      "2026-01-12T18:00:00Z",
    );
    await snapshot(
      "XS00TEST0002",
      "2026-01-07T17:30:00Z",
      "99",
      "2026-01-07T18:00:00Z",
    );
  };
  const prices = (rows: { price: string }[]) => rows.map((r) => r.price);

  it("returns the whole history, oldest first, when no start is given", async () => {
    await seedHistory();
    expect(prices(await priceRepo.historyFor("XS00TEST0001"))).toEqual([
      "10",
      "11",
      "12",
      "13",
    ]);
  });

  it("starts at the last snapshot at or before the start, then everything after", async () => {
    await seedHistory();
    const rows = await priceRepo.historyFor(
      "XS00TEST0001",
      new Date("2026-01-08T10:00:00Z"),
    );
    expect(prices(rows)).toEqual(["11", "12", "13"]);
    expect(rows.every((r) => r.instrumentId === "XS00TEST0001")).toBe(true);
  });

  it("keeps a snapshot that falls exactly on the start as the anchor", async () => {
    await seedHistory();
    expect(
      prices(
        await priceRepo.historyFor(
          "XS00TEST0001",
          new Date("2026-01-09T17:30:00Z"),
        ),
      ),
    ).toEqual(["12", "13"]);
  });

  it("starts at the first snapshot available when none is at or before the start", async () => {
    await seedHistory();
    expect(
      prices(
        await priceRepo.historyFor(
          "XS00TEST0001",
          new Date("2025-06-01T00:00:00Z"),
        ),
      ),
    ).toEqual(["10", "11", "12", "13"]);
  });

  it("keeps the newest snapshot when the start is after the whole history", async () => {
    await seedHistory();
    expect(
      prices(
        await priceRepo.historyFor(
          "XS00TEST0001",
          new Date("2027-01-01T00:00:00Z"),
        ),
      ),
    ).toEqual(["13"]);
  });

  it("returns nothing for an instrument without snapshots", async () => {
    await seedHistory();
    expect(
      await priceRepo.historyFor(
        "XS00TEST0003",
        new Date("2026-01-08T00:00:00Z"),
      ),
    ).toEqual([]);
  });
});

describe("PrismaPriceRepository.saveDaily (integration)", () => {
  const ID = "XS00TEST0001";
  const candle = (asOf: string, price: string, source = "YAHOO") => ({
    instrumentId: ID,
    price,
    currency: "EUR",
    asOf: new Date(asOf),
    source,
  });
  const live = (asOf: string, price: string) =>
    candle(asOf, price, "YAHOO_LIVE");
  const stored = async () =>
    (
      await prisma.priceSnapshot.findMany({
        where: { instrumentId: ID },
        orderBy: { asOf: "asc" },
      })
    ).map((r) => `${r.asOf.toISOString()} ${r.price} ${r.source}`);

  it("replaces the day's live row with a newer one", async () => {
    await priceRepo.saveDaily(ID, [], live("2026-10-14T08:00:00Z", "1"));
    await priceRepo.saveDaily(ID, [], live("2026-10-14T15:35:00Z", "2"));
    expect(await stored()).toEqual([
      "2026-10-14T15:35:00.000Z 2 YAHOO_LIVE",
    ]);
  });

  it("deletes the day's live row and any old YAHOO row when its candle arrives", async () => {
    await snapshot(ID, "2026-10-09T15:35:16Z", "9", "2026-10-09T16:44:00Z");
    await priceRepo.saveDaily(ID, [], live("2026-10-13T15:35:00Z", "3"));
    const written = await priceRepo.saveDaily(
      ID,
      [candle("2026-10-09T07:00:00Z", "10"), candle("2026-10-13T07:00:00Z", "13")],
      null,
    );
    expect(written).toEqual({ inserted: 2, corrected: 0, live: false });
    expect(await stored()).toEqual([
      "2026-10-09T07:00:00.000Z 10 YAHOO",
      "2026-10-13T07:00:00.000Z 13 YAHOO",
    ]);
  });

  it("updates a candle with the same asOf instead of duplicating it", async () => {
    await priceRepo.saveDaily(ID, [candle("2026-10-09T07:00:00Z", "10")], null);
    expect(
      await priceRepo.saveDaily(ID, [candle("2026-10-09T07:00:00Z", "11")], null),
    ).toEqual({ inserted: 0, corrected: 1, live: false });
    expect(
      await priceRepo.saveDaily(ID, [candle("2026-10-09T07:00:00Z", "11")], null),
    ).toEqual({ inserted: 0, corrected: 0, live: false });
    expect(await stored()).toEqual(["2026-10-09T07:00:00.000Z 11 YAHOO"]);
  });

  it("never returns latest() to an earlier day when yesterday's candle lands", async () => {
    await priceRepo.saveDaily(ID, [], live("2026-10-15T09:00:00Z", "15"));
    await priceRepo.saveDaily(ID, [candle("2026-10-14T07:00:00Z", "14")], null);
    expect((await priceRepo.latest()).get(ID)?.price).toBe("15");
  });

  it("rolls the deletes back when a write fails", async () => {
    await priceRepo.saveDaily(ID, [], live("2026-10-09T15:35:00Z", "9"));
    await expect(
      priceRepo.saveDaily(
        ID,
        [
          candle("2026-10-09T07:00:00Z", "10"),
          { ...candle("2026-10-10T07:00:00Z", "11"), price: null as unknown as string },
        ],
        null,
      ),
    ).rejects.toThrow();
    expect(await stored()).toEqual(["2026-10-09T15:35:00.000Z 9 YAHOO_LIVE"]);
  });

  it("lastAsOf is the newest row whatever its source", async () => {
    await priceRepo.saveDaily(ID, [candle("2026-10-13T07:00:00Z", "13")], live("2026-10-14T15:35:00Z", "14"));
    expect((await priceRepo.lastAsOf(ID))?.toISOString()).toBe("2026-10-14T15:35:00.000Z");
    expect(await priceRepo.lastAsOf("XS00TEST0003")).toBeNull();
  });
});

describe("PrismaPriceRepository.dailyHistoryIds (integration)", () => {
  it("counts daily candles and never live quotes alone", async () => {
    const row = (instrumentId: string, asOf: string, source: string) =>
      prisma.priceSnapshot.create({
        data: { instrumentId, price: "10", currency: "EUR", asOf: new Date(asOf), source },
      });
    await row("XS00TEST0001", "2026-10-14T07:00:00Z", "YAHOO");
    await row("XS00TEST0001", "2026-10-15T14:00:00Z", "YAHOO_LIVE");
    await row("XS00TEST0002", "2026-10-14T14:00:00Z", "YAHOO_LIVE");
    await row("XS00TEST0002", "2026-10-15T14:00:00Z", "YAHOO_LIVE");

    expect(await priceRepo.dailyHistoryIds()).toEqual(new Set(["XS00TEST0001"]));
  });
});
