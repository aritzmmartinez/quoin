import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  krakenCsv,
  type KrakenFixtureRow,
} from "~/adapters/ingestion/kraken/csv-fixture";
import { rateBookFrom } from "~/core/fx";
import { walkAvco } from "~/core/projections/avco";
import { walkFifo } from "~/core/tax/fifo";

import { buildTaxYearView } from "./tax";

type Persistence = typeof import("~/adapters/persistence");
type Ingestion = typeof import("~/adapters/ingestion");

let persistence: Persistence;
let ingestion: Ingestion;

const tmpDir = "./.tmp-kraken-swaps";
const dbPath = `${tmpDir}/it-${Date.now()}.sqlite`;

const usd = rateBookFrom(
  ["2026-03-04"].map((day) => ({
    source: "ECB",
    base: "EUR",
    quote: "USD",
    day,
    rate: "1.25",
  })),
);

const BEFORE: KrakenFixtureRow[] = [
  {
    refid: "D1",
    time: "2026-03-04 08:00:00",
    type: "deposit",
    subclass: "fiat",
    asset: "EUR",
    amount: "500",
  },
  {
    refid: "B1",
    time: "2026-03-04 09:00:00",
    type: "spend",
    subclass: "fiat",
    asset: "EUR",
    amount: "-100",
  },
  {
    refid: "B1",
    time: "2026-03-04 09:00:00",
    type: "receive",
    subclass: "crypto",
    asset: "ETH",
    amount: "0.05",
  },
];

const SWAP: KrakenFixtureRow[] = [
  {
    refid: "S1",
    time: "2026-03-04 10:00:00",
    type: "spend",
    subclass: "crypto",
    asset: "ETH",
    amount: "-0.05",
    amountusd: "-165",
    feeusd: "0",
  },
  {
    refid: "S1",
    time: "2026-03-04 10:00:00",
    type: "receive",
    subclass: "crypto",
    asset: "BTC",
    amount: "0.0015",
    fee: "0.000003",
    amountusd: "163.5",
    feeusd: "0.33",
  },
];

const FULL = krakenCsv([...BEFORE, ...SWAP]);
const WITHOUT_SWAP = krakenCsv(BEFORE);

beforeAll(async () => {
  mkdirSync(tmpDir, { recursive: true });
  const dbUrl = `file:${dbPath}`;
  process.env.DATABASE_URL = dbUrl;
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: dbUrl },
  });
  persistence = await import("~/adapters/persistence");
  ingestion = await import("~/adapters/ingestion");
});

beforeEach(async () => {
  const { prisma } = persistence;
  await prisma.ledgerEntry.deleteMany();
  await prisma.priceSnapshot.deleteMany();
  await prisma.instrument.deleteMany();
});

afterAll(async () => {
  if (persistence) await persistence.prisma.$disconnect();
  rmSync(tmpDir, { recursive: true, force: true });
});

function adapter() {
  return new ingestion.KrakenCsvAdapter(
    new persistence.PrismaInstrumentRepository(),
    new persistence.PrismaLedgerRepository(),
    new persistence.PrismaPriceRepository(),
    async () => usd,
  );
}

const stored = () => new persistence.PrismaLedgerRepository().list();

describe("a Kraken swap through SQLite (integration)", () => {
  it("stores two rows with one link, the quantities and the values Kraken gave", async () => {
    const summary = await adapter().import(FULL);

    expect(summary.imported).toBe(3);
    expect(summary.discarded).toEqual({});

    const legs = (await stored()).filter((e) => e.linkId === "S1");
    expect(legs.map((e) => e.externalId).sort()).toEqual(["S1:buy", "S1:sell"]);
    expect(legs.every((e) => e.linkKind === "swap")).toBe(true);
    expect(legs.every((e) => e.valuationSource === "kraken-amountusd")).toBe(
      true,
    );

    const sell = legs.find((e) => e.externalId === "S1:sell");
    const buy = legs.find((e) => e.externalId === "S1:buy");
    expect(sell).toMatchObject({
      type: "SELL",
      instrumentId: "ETH",
      quantity: "0.05",
      grossAmount: "165",
      fees: "0",
      currency: "USD",
      fxSource: "ECB",
      fxRate: "1.25",
    });
    expect(buy).toMatchObject({
      type: "BUY",
      instrumentId: "BTC",
      quantity: "0.001497",
      grossAmount: "163.17",
      fees: "0.33",
      currency: "USD",
      fxSource: "ECB",
      fxRate: "1.25",
    });
  });

  it("writes nothing when the same file comes in again", async () => {
    await adapter().import(FULL);
    const before = await stored();

    const again = await adapter().import(FULL);

    expect(again.imported).toBe(0);
    expect(again.duplicates).toBe(3);
    expect(await stored()).toHaveLength(before.length);
  });

  it("adds only the two legs to an export already imported with its swaps set aside", async () => {
    await adapter().import(WITHOUT_SWAP);
    const earlier = await stored();
    expect(earlier.map((e) => e.externalId).sort()).toEqual(["B1", "D1"]);

    const summary = await adapter().import(FULL);

    expect(summary.imported).toBe(1);
    expect(summary.duplicates).toBe(2);
    const later = await stored();
    const known = new Set(earlier.map((e) => e.id));
    expect(
      later
        .filter((e) => !known.has(e.id))
        .map((e) => e.externalId)
        .sort(),
    ).toEqual(["S1:buy", "S1:sell"]);
    expect(later.filter((e) => known.has(e.id))).toHaveLength(earlier.length);
  });

  it("is read back as T − F on both legs by FIFO, AVCO and the tax view", async () => {
    await adapter().import(FULL);
    const events = await stored();
    const instruments =
      await new persistence.PrismaInstrumentRepository().list();

    const sale = walkFifo(events).sales[0]!;
    expect(sale.trade.externalId).toBe("S1:sell");
    expect(sale.gross.toString()).toBe("132");
    expect(sale.fees.toString()).toBe("0.26");
    expect(sale.gross.subtract(sale.fees).toString()).toBe("131.74");

    const btc = walkAvco(events).lots.get("BTC")!;
    expect(btc.costBasis.toString()).toBe("131.74");
    expect(btc.quantity.toString()).toBe("0.001497");

    const view = buildTaxYearView(events, instruments, 2026, "2026-12-31");
    expect(view.sales).toHaveLength(1);
    expect(view.sales[0]).toMatchObject({
      instrumentId: "ETH",
      grossAmount: "132",
      fees: "0.26",
      costBasis: "100",
      realizedPnL: "31.74",
    });
  });
});
