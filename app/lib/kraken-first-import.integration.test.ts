import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { HistoryRange, MarketDataProvider, Quote } from "~/core/ports";

import { copyFor } from "./i18n";
import {
  earliestUnpricedReward,
  mergeRewardRetry,
  retryAfterFill,
  rewardRetryIds,
  rewardsNeedMapping,
  unpricedRewards,
} from "./ingest";
import {
  backfillInstruments,
  rangeCovering,
  rewardBackfillRange,
} from "./prices-backfill";
import { remapQuoteSymbol } from "./quote-symbol";

type Persistence = typeof import("~/adapters/persistence");
type Ingestion = typeof import("~/adapters/ingestion");
type Server = typeof import("./ingest.server");

let persistence: Persistence;
let ingestion: Ingestion;
let server: Server;

const tmpDir = "./.tmp-kraken-first-import";
const dbPath = `${tmpDir}/it-${Date.now()}.sqlite`;

const HEADER =
  "txid,refid,time,type,subtype,aclass,subclass,asset,wallet,amount,fee,balance";

const BUYS_AND_REWARDS = [
  HEADER,
  `"k1","D1","2026-02-02 09:00:00","deposit","","currency","fiat","EUR","spot / main",500.0000,0,500`,
  `"k2","B1","2026-02-03 10:00:00","spend","","currency","fiat","EUR","spot / main",-100.0000,0,400`,
  `"k3","B1","2026-02-03 10:00:00","receive","","currency","crypto","BTC","spot / main",0.0012500000,0,0.00125`,
  `"k4","R1","2026-03-01 05:52:00","reward","","currency","crypto","BTC","spot / main",0.0000020000,0,0.001252`,
  `"k5","R2","2026-03-08 05:52:00","reward","","currency","crypto","BTC","spot / main",0.0000030000,0,0.001255`,
  `"k6","R3","2026-03-15 05:52:00","reward","welcomebonus","currency","crypto","BTC","spot / main",0.0000050000,0,0.00126`,
].join("\n");

const REWARDS_ONLY = [
  HEADER,
  `"r1","R1","2026-03-01 05:52:00","reward","welcomebonus","currency","crypto","BTC","spot / main",0.0000020000,0,0.000002`,
  `"r2","R2","2026-03-08 05:52:00","reward","","currency","crypto","BTC","spot / main",0.0000030000,0,0.000005`,
].join("\n");

const candleFor = (day: number) => String(80000 + day * 10);

function dailyCandles(): Quote[] {
  const quotes: Quote[] = [];
  for (let day = 0; day < 60; day += 1) {
    quotes.push({
      symbol: "BTC-EUR",
      price: candleFor(day),
      currency: "EUR",
      asOf: new Date(Date.UTC(2026, 1, 1 + day)),
    });
  }
  return quotes;
}

const provider: MarketDataProvider = {
  source: "FAKE",
  getQuotes: async () => [],
  getHistory: async (symbol: string, _range: HistoryRange) =>
    symbol === "BTC-EUR" ? dailyCandles() : [],
};

function dayIndex(iso: string): number {
  const date = new Date(iso);
  return Math.round(
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
      Date.UTC(2026, 1, 1)) /
      86_400_000,
  );
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
  ingestion = await import("~/adapters/ingestion");
  server = await import("./ingest.server");
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

async function firstImportFlow(csv: string) {
  const instruments = new persistence.PrismaInstrumentRepository();
  const ledger = new persistence.PrismaLedgerRepository();
  const prices = new persistence.PrismaPriceRepository();
  const adapter = new ingestion.KrakenCsvAdapter(instruments, ledger, prices);

  const first = await adapter.import(csv);

  const ids = rewardRetryIds(first);
  for (const id of ids) {
    await remapQuoteSymbol(instruments, prices, id, "BTC-EUR");
  }
  await backfillInstruments(
    provider,
    prices,
    ids.map((id) => ({ id, quoteSymbol: "BTC-EUR" })),
    rangeCovering(earliestUnpricedReward(first)!, new Date()),
  );

  const retry = await adapter.import(csv);
  return { adapter, ledger, first, retry, merged: mergeRewardRetry(first, retry) };
}

describe("first Kraken import into an empty database (integration)", () => {
  it("sets every BTC reward aside on the first write, then values all of them on the retry", async () => {
    const { ledger, first, retry, merged } =
      await firstImportFlow(BUYS_AND_REWARDS);

    expect(first.imported).toBe(2);
    expect(unpricedRewards(first)).toBe(3);

    expect(unpricedRewards(retry)).toBe(0);
    expect(retry.imported).toBe(3);
    expect(retry.duplicates).toBe(2);
    expect(merged.recovered).toBe(3);
    expect(merged.summary.imported).toBe(5);
    expect(merged.summary.discarded["reward-unpriced"]).toBeUndefined();

    const events = await ledger.list();
    const rewards = events.filter((e) => e.note === "kraken-reward");
    const income = events.filter((e) => e.note === "kraken-reward-income");
    expect(rewards).toHaveLength(3);
    expect(income).toHaveLength(3);

    for (const event of rewards) {
      if (event.type !== "BUY") throw new Error("a reward must be a BUY");
      const price = candleFor(dayIndex(event.ts.toISOString()));
      expect(event.price).toBe(price);
      const twin = income.find((e) => e.externalId === `${event.externalId}:income`);
      expect(twin?.type === "DIVIDEND" && twin.grossAmount).toBe(event.grossAmount);
    }
    expect(
      rewards.map((e) => e.type === "BUY" && [e.quantity, e.grossAmount]),
    ).toEqual([
      ["0.000002", "0.16056"],
      ["0.000003", "0.24105"],
      ["0.000005", "0.4021"],
    ]);
  });

  it("is idempotent once everything is valued: a third import writes nothing", async () => {
    const { adapter } = await firstImportFlow(BUYS_AND_REWARDS);

    const third = await adapter.import(BUYS_AND_REWARDS);

    expect(third.imported).toBe(0);
    expect(third.duplicates).toBe(5);
    expect(unpricedRewards(third)).toBe(0);
  });

  it("creates BTC on the first write even when the file holds nothing but rewards", async () => {
    const { first, merged } = await firstImportFlow(REWARDS_ONLY);

    expect(first.imported).toBe(0);
    expect(first.instruments).toBe(1);
    expect(merged.recovered).toBe(2);
  });
});

describe("wizard path with BTC left unmapped (integration)", () => {
  it("does not re-import, keeps the rewards unpriced with their help, and writes nothing half-way", async () => {
    const committed = await server.commitIngest(copyFor("es"), BUYS_AND_REWARDS);

    expect(committed.summary.imported).toBe(2);
    expect(unpricedRewards(committed.summary)).toBe(3);
    expect(committed.retryIds).toEqual(["BTC"]);
    expect(committed.pending.map((p) => p.instrumentId)).toEqual(["BTC"]);

    const fill = await server.fillPrices(
      committed.retryIds,
      rewardBackfillRange(earliestUnpricedReward(committed.summary), new Date()),
    );

    expect(fill.backfilled).toEqual([]);
    expect(fill.candles).toBe(0);
    expect(retryAfterFill(committed.summary, fill)).toBe(false);
    expect(rewardsNeedMapping(committed.summary, committed.pending, {})).toBe(true);

    const events = await new persistence.PrismaLedgerRepository().list();
    expect(events).toHaveLength(2);
    expect(events.some((e) => e.note?.startsWith("kraken-reward"))).toBe(false);
    expect(await persistence.prisma.priceSnapshot.count()).toBe(0);
    const btc = await new persistence.PrismaInstrumentRepository().get("BTC");
    expect(btc?.quoteSymbol ?? null).toBeNull();
  });

  it("names the way out in the wizard's own terms, never a terminal command", () => {
    for (const locale of ["es", "en"] as const) {
      const copy = copyFor(locale).ingest;
      const texts = [
        copy.summary.reasonHelp["reward-unpriced"],
        copy.summary.pendingPriceNote,
        copy.done.rewardsNeedMapping,
      ];
      for (const text of texts) {
        expect(text).toBeTruthy();
        expect(text).not.toMatch(/pnpm|prices:|ingest --|\bcli\b/i);
      }
    }
  });
});

function candles(dates: readonly Date[], price: (date: Date) => string): Quote[] {
  return dates.map((asOf) => ({
    symbol: "BTC-EUR",
    price: price(asOf),
    currency: "EUR",
    asOf,
  }));
}

function providerOf(quotes: Quote[]): MarketDataProvider {
  return {
    source: "FAKE",
    getQuotes: async () => [],
    getHistory: async (symbol: string) => (symbol === "BTC-EUR" ? quotes : []),
  };
}

async function priceAndRetry(
  csv: string,
  first: Awaited<ReturnType<Ingestion["KrakenCsvAdapter"]["prototype"]["import"]>>,
  quotes: Quote[],
) {
  const instruments = new persistence.PrismaInstrumentRepository();
  const prices = new persistence.PrismaPriceRepository();
  const adapter = new ingestion.KrakenCsvAdapter(
    instruments,
    new persistence.PrismaLedgerRepository(),
    prices,
  );
  if (!(await instruments.get("BTC"))?.quoteSymbol) {
    await remapQuoteSymbol(instruments, prices, "BTC", "BTC-EUR");
  }
  await backfillInstruments(
    providerOf(quotes),
    prices,
    [{ id: "BTC", quoteSymbol: "BTC-EUR" }],
    "max",
  );
  return mergeRewardRetry(first, await adapter.import(csv));
}

const utcDay = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const dailyFrom = (start: Date, days: number) =>
  Array.from({ length: days }, (_, i) => new Date(start.getTime() + i * 86_400_000));

describe("candle spacing and the 7-day lookup (integration)", () => {
  const LATE_NOVEMBER = [
    HEADER,
    `"n1","B1","2025-11-13 18:04:48","spend","","currency","fiat","EUR","spot / main",-150.0000,0,0`,
    `"n2","B1","2025-11-13 18:04:48","receive","","currency","crypto","BTC","spot / main",0.0020000000,0,0.002`,
    `"n3","R1","2025-11-26 05:52:00","reward","","currency","crypto","BTC","spot / main",0.0000040000,0,0.002004`,
  ].join("\n");

  it("leaves a reward unpriced when the nearest earlier candle is a month away, and prices it from daily candles", async () => {
    const adapter = new ingestion.KrakenCsvAdapter(
      new persistence.PrismaInstrumentRepository(),
      new persistence.PrismaLedgerRepository(),
      new persistence.PrismaPriceRepository(),
    );
    const first = await adapter.import(LATE_NOVEMBER);
    expect(unpricedRewards(first)).toBe(1);

    const monthly = await priceAndRetry(
      LATE_NOVEMBER,
      first,
      candles([utcDay(2025, 11, 1), utcDay(2025, 12, 1)], () => "90000"),
    );
    expect(monthly.recovered).toBe(0);
    expect(unpricedRewards(monthly.summary)).toBe(1);

    const daily = await priceAndRetry(
      LATE_NOVEMBER,
      monthly.summary,
      candles(dailyFrom(utcDay(2025, 11, 1), 40), (d) => String(80000 + d.getUTCDate())),
    );
    expect(daily.recovered).toBe(1);
    expect(unpricedRewards(daily.summary)).toBe(0);

    const reward = (await new persistence.PrismaLedgerRepository().list()).find(
      (e) => e.note === "kraken-reward",
    );
    expect(reward?.type === "BUY" && reward.price).toBe("80026");
  });

  it("prices a reward older than the instrument's first written trade", async () => {
    const BONUS_BEFORE_BUY = [
      HEADER,
      `"o1","R0","2026-02-02 05:52:00","reward","welcomebonus","currency","crypto","BTC","spot / main",0.0000020000,0,0.000002`,
      `"o2","B1","2026-02-10 10:00:00","spend","","currency","fiat","EUR","spot / main",-100.0000,0,0`,
      `"o3","B1","2026-02-10 10:00:00","receive","","currency","crypto","BTC","spot / main",0.0012500000,0,0.001252`,
    ].join("\n");

    const { first, merged } = await firstImportFlow(BONUS_BEFORE_BUY);

    expect(unpricedRewards(first)).toBe(1);
    expect(merged.recovered).toBe(1);
    const events = await new persistence.PrismaLedgerRepository().list();
    const bonus = events.find((e) => e.note === "kraken-reward");
    expect(bonus?.ts.toISOString()).toBe("2026-02-02T05:52:00.000Z");
    expect(bonus!.ts.getTime()).toBeLessThan(
      events.find((e) => e.externalId === "B1")!.ts.getTime(),
    );
  });
});

describe("the summary counts operations, like the file and the discards (integration)", () => {
  const accounted = (summary: {
    imported: number;
    duplicates: number;
    errors: number;
    discarded: Partial<Record<string, number>>;
  }) =>
    summary.imported +
    summary.duplicates +
    summary.errors +
    Object.values(summary.discarded).reduce((sum: number, n) => sum + (n ?? 0), 0);

  it("adds new, duplicate and set-aside operations up to the file, in the preview and after the recovery", async () => {
    const adapter = new ingestion.KrakenCsvAdapter(
      new persistence.PrismaInstrumentRepository(),
      new persistence.PrismaLedgerRepository(),
      new persistence.PrismaPriceRepository(),
    );
    const preview = await ingestion.previewBatch(
      new persistence.PrismaLedgerRepository(),
      await adapter.plan(BUYS_AND_REWARDS),
    );
    expect(preview.total).toBe(5);
    expect(accounted(preview)).toBe(preview.total);

    const { retry, merged } = await firstImportFlow(BUYS_AND_REWARDS);

    expect(accounted(retry)).toBe(retry.total);
    expect(accounted(merged.summary)).toBe(merged.summary.total);
    expect(merged.summary.imported).toBe(preview.imported + merged.recovered);
  });

  it("writes two ledger rows per recovered reward, and no key twice", async () => {
    const { first, merged } = await firstImportFlow(BUYS_AND_REWARDS);
    const rows = await persistence.prisma.ledgerEntry.count();

    expect(rows).toBe(first.imported + merged.recovered * 2);

    const keys = await persistence.prisma.ledgerEntry.findMany({
      select: { source: true, externalId: true },
    });
    expect(new Set(keys.map((k) => `${k.source}:${k.externalId}`)).size).toBe(
      rows,
    );
  });
});
