import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Instrument } from "~/core/domain";
import type { HistoryRange, MarketDataProvider, Quote } from "~/core/ports";

import { isCoarseSeries } from "./coarse-candles";
import { replaceQuoteHistory } from "./price-history";

type Persistence = typeof import("~/adapters/persistence");

let persistence: Persistence;

const tmpDir = "./.tmp-price-history";
const dbPath = `${tmpDir}/it-${Date.now()}.sqlite`;

const ID = "XS00TEST0007";
const NOW = new Date("2026-10-08T15:00:00.000Z");

const instrument: Instrument = {
  id: ID,
  name: "Synthetic Accumulating Fund",
  type: "ETF",
  currency: "EUR",
  quoteSymbol: "OLD.DE",
  thesis: "CORE",
};

function weekdays(from: Date, count: number, symbol: string): Quote[] {
  const quotes: Quote[] = [];
  const cursor = new Date(from);
  while (quotes.length < count) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      quotes.push({
        symbol,
        price: String(100 + quotes.length),
        currency: "EUR",
        asOf: new Date(cursor),
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return quotes;
}

const DAILY = (symbol: string) =>
  weekdays(new Date("2026-06-01T07:00:00.000Z"), 92, symbol);

function provider(history: Quote[], live: Quote[] = []): MarketDataProvider {
  return {
    source: "YAHOO",
    getQuotes: async () => live,
    getHistory: async (_symbol: string, _range: HistoryRange) => history,
  };
}

async function seedCoarse() {
  const { prisma } = persistence;
  const weekly = Array.from({ length: 12 }, (_, i) => ({
    instrumentId: ID,
    price: String(90 + i),
    currency: "EUR",
    asOf: new Date(Date.UTC(2026, 3, 5 + i * 7, 22)),
    source: "YAHOO",
  }));
  await prisma.priceSnapshot.createMany({
    data: [
      ...weekly,
      {
        instrumentId: ID,
        price: "150",
        currency: "EUR",
        asOf: new Date("2026-10-08T09:30:00.000Z"),
        source: "YAHOO",
      },
    ],
  });
}

async function storedSymbol() {
  const row = await persistence.prisma.instrument.findUnique({
    where: { id: ID },
  });
  return row?.quoteSymbol ?? null;
}

async function ledgerRows() {
  return persistence.prisma.ledgerEntry.findMany({ orderBy: { id: "asc" } });
}

beforeAll(async () => {
  mkdirSync(tmpDir, { recursive: true });
  const dbUrl = `file:${dbPath}`;
  process.env.DATABASE_URL = dbUrl;
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: dbUrl },
  });
  persistence = await import("~/adapters/persistence");
});

beforeEach(async () => {
  const { prisma } = persistence;
  await prisma.ledgerEntry.deleteMany();
  await prisma.priceSnapshot.deleteMany();
  await prisma.instrument.deleteMany();
  await new persistence.PrismaInstrumentRepository().upsert([instrument]);
  await prisma.instrument.update({
    where: { id: ID },
    data: { quoteSymbol: "OLD.DE" },
  });
  await prisma.ledgerEntry.create({
    data: {
      id: "synthetic-buy-1",
      ts: new Date("2026-05-04T10:00:00.000Z"),
      type: "BUY",
      instrumentId: ID,
      quantity: "3",
      price: "95.5",
      grossAmount: "286.5",
      fees: "1",
      currency: "EUR",
      source: "TEST",
      externalId: "T-1",
    },
  });
  await seedCoarse();
});

afterAll(async () => {
  if (persistence) await persistence.prisma.$disconnect();
  rmSync(tmpDir, { recursive: true, force: true });
});

function deps(market: MarketDataProvider) {
  return {
    instruments: new persistence.PrismaInstrumentRepository(),
    prices: new persistence.PrismaPriceRepository(),
    provider: market,
    now: NOW,
  };
}

describe("replaceQuoteHistory (integration)", () => {
  it("leaves only the new symbol's daily candles plus today's quote, and the ledger as it was", async () => {
    const prices = new persistence.PrismaPriceRepository();
    const ledgerBefore = await ledgerRows();
    const latestBefore = (await prices.latest()).get(ID)!.asOf;
    expect(isCoarseSeries((await prices.candleTimes()).get(ID)!)).toBe(true);

    const live: Quote = {
      symbol: "NEW.DE",
      price: "199",
      currency: "EUR",
      asOf: new Date("2026-10-08T14:45:00.000Z"),
    };
    const outcome = await replaceQuoteHistory(
      deps(provider(DAILY("NEW.DE"), [live])),
      { instrumentId: ID, symbol: "NEW.DE", range: "5y" },
    );

    expect(outcome).toMatchObject({ ok: true, removed: 13, written: 93 });

    const rows = await persistence.prisma.priceSnapshot.findMany({
      where: { instrumentId: ID },
      orderBy: { asOf: "asc" },
    });
    expect(rows).toHaveLength(93);
    expect(rows.every((r) => r.currency === "EUR")).toBe(true);
    expect(rows.at(-1)?.price).toBe("199");
    expect(isCoarseSeries(rows.map((r) => r.asOf))).toBe(false);
    expect(await storedSymbol()).toBe("NEW.DE");

    const latestAfter = (await prices.latest()).get(ID)!.asOf;
    expect(latestAfter.getTime()).toBeGreaterThanOrEqual(
      latestBefore.getTime(),
    );
    expect(await ledgerRows()).toEqual(ledgerBefore);
  });

  it("keeps the newer row when the symbol is unchanged and today's quote does not arrive", async () => {
    const prices = new persistence.PrismaPriceRepository();
    const latestBefore = (await prices.latest()).get(ID)!;

    await replaceQuoteHistory(deps(provider(DAILY("OLD.DE"))), {
      instrumentId: ID,
      symbol: "OLD.DE",
      range: "5y",
    });

    const latestAfter = (await prices.latest()).get(ID)!;
    expect(latestAfter.asOf).toEqual(latestBefore.asOf);
    expect(latestAfter.price).toBe("150");
  });

  it("touches nothing when the provider returns no candles", async () => {
    const before = await persistence.prisma.priceSnapshot.findMany({
      orderBy: { asOf: "asc" },
    });

    const outcome = await replaceQuoteHistory(deps(provider([])), {
      instrumentId: ID,
      symbol: "NEW.DE",
      range: "5y",
    });

    expect(outcome).toMatchObject({ ok: false, reason: "no-history" });
    expect(
      await persistence.prisma.priceSnapshot.findMany({
        orderBy: { asOf: "asc" },
      }),
    ).toEqual(before);
    expect(await storedSymbol()).toBe("OLD.DE");
  });
});

describe("PrismaPriceRepository.replaceHistory (integration)", () => {
  it("rolls the delete and the symbol back when the write fails", async () => {
    const prices = new persistence.PrismaPriceRepository();
    const before = await persistence.prisma.priceSnapshot.count();
    const twice = {
      instrumentId: ID,
      price: "1",
      currency: "EUR",
      asOf: new Date("2026-09-01T07:00:00.000Z"),
      source: "YAHOO",
    };

    await expect(
      prices.replaceHistory(ID, [twice, twice], { quoteSymbol: "NEW.DE" }),
    ).rejects.toThrow();

    expect(await persistence.prisma.priceSnapshot.count()).toBe(before);
    expect(await storedSymbol()).toBe("OLD.DE");
  });
});
