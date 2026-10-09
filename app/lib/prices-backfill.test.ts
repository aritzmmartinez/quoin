import { describe, expect, it } from "vitest";

import type {
  HistoryRange,
  MarketDataProvider,
  PriceRepository,
  PriceSnapshot,
  Quote,
} from "~/core/ports";

import {
  backfillInstruments,
  isHistoryRange,
  medianGapDays,
  rangeCovering,
  rangeSince,
  widerRange,
} from "./prices-backfill";

const day = (iso: string) => new Date(`${iso}T07:00:00.000Z`);

function fakeProvider(history: Record<string, Quote[]>): {
  provider: MarketDataProvider;
  asked: string[];
} {
  const asked: string[] = [];
  const provider: MarketDataProvider = {
    source: "FAKE",
    getQuotes: async () => [],
    getHistory: async (symbol: string, _range: HistoryRange) => {
      asked.push(symbol);
      return history[symbol] ?? [];
    },
  };
  return { provider, asked };
}

function fakeRepository(): { prices: PriceRepository; saved: PriceSnapshot[] } {
  const saved: PriceSnapshot[] = [];
  const prices = {
    saveMany: async (snapshots: readonly PriceSnapshot[]) => {
      saved.push(...snapshots);
      return snapshots.length;
    },
  } as unknown as PriceRepository;
  return { prices, saved };
}

const quote = (iso: string, price: string): Quote => ({
  symbol: "AAA.DE",
  price,
  currency: "EUR",
  asOf: day(iso),
});

describe("medianGapDays", () => {
  it("is one day for a daily series", () => {
    expect(
      medianGapDays([
        { asOf: day("2026-01-05") },
        { asOf: day("2026-01-06") },
        { asOf: day("2026-01-07") },
      ]),
    ).toBe(1);
  });

  it("is zero when there is nothing to measure", () => {
    expect(medianGapDays([{ asOf: day("2026-01-05") }])).toBe(0);
  });
});

describe("backfillInstruments", () => {
  it("stores every candle under the instrument, with the provider's source", async () => {
    const { provider } = fakeProvider({
      "AAA.DE": [quote("2026-01-05", "10"), quote("2026-01-06", "11")],
    });
    const { prices, saved } = fakeRepository();

    const [report] = await backfillInstruments(
      provider,
      prices,
      [{ id: "XS00TEST0001", quoteSymbol: "AAA.DE" }],
      "5y",
    );

    expect(report?.written).toBe(2);
    expect(report?.currency).toBe("EUR");
    expect(report?.weekly).toBe(false);
    expect(saved.map((s) => s.instrumentId)).toEqual([
      "XS00TEST0001",
      "XS00TEST0001",
    ]);
    expect(saved[0]?.source).toBe("FAKE");
  });

  it("stores nothing for a history that is not in euros, and says which currency", async () => {
    const { provider } = fakeProvider({
      AAA: [
        { ...quote("2026-01-05", "10"), symbol: "AAA", currency: "USD" },
        { ...quote("2026-01-06", "11"), symbol: "AAA", currency: "USD" },
      ],
    });
    const { prices, saved } = fakeRepository();

    const [report] = await backfillInstruments(
      provider,
      prices,
      [{ id: "XS00TEST0001", quoteSymbol: "AAA" }],
      "5y",
    );

    expect(report).toMatchObject({ written: 0, foreignCurrency: "USD" });
    expect(saved).toEqual([]);
  });

  it("flags a range the provider degraded to weekly candles", async () => {
    const { provider } = fakeProvider({
      "AAA.DE": [
        quote("2026-01-05", "10"),
        quote("2026-01-12", "11"),
        quote("2026-01-19", "12"),
      ],
    });
    const { prices } = fakeRepository();

    const [report] = await backfillInstruments(
      provider,
      prices,
      [{ id: "XS00TEST0001", quoteSymbol: "AAA.DE" }],
      "max",
    );

    expect(report?.weekly).toBe(true);
  });

  it("reports an empty history instead of writing anything", async () => {
    const { provider } = fakeProvider({});
    const { prices, saved } = fakeRepository();

    const [report] = await backfillInstruments(
      provider,
      prices,
      [{ id: "XS00TEST0001", quoteSymbol: "XS00TEST0001.SG" }],
      "5y",
    );

    expect(report).toMatchObject({ written: 0, first: null, last: null });
    expect(saved).toEqual([]);
  });

  it("asks one symbol at a time — the chart endpoint rate-limits", async () => {
    const { provider, asked } = fakeProvider({
      "AAA.DE": [quote("2026-01-05", "10")],
      "BBB.DE": [quote("2026-01-05", "20")],
    });
    const { prices } = fakeRepository();

    const reports = await backfillInstruments(
      provider,
      prices,
      [
        { id: "XS00TEST0001", quoteSymbol: "AAA.DE" },
        { id: "XS00TEST0002", quoteSymbol: "BBB.DE" },
      ],
      "1y",
    );

    expect(asked).toEqual(["AAA.DE", "BBB.DE"]);
    expect(reports).toHaveLength(2);
  });
});

describe("isHistoryRange", () => {
  it("accepts the offered ranges and nothing else", () => {
    expect(isHistoryRange("5y")).toBe(true);
    expect(isHistoryRange("max")).toBe(true);
    expect(isHistoryRange("3y")).toBe(false);
  });
});

describe("rangeCovering", () => {
  const now = new Date("2026-10-07T12:00:00.000Z");
  const daysAgo = (days: number) =>
    new Date(now.getTime() - days * 86_400_000);

  it("picks the smallest range that reaches the date with a week to spare", () => {
    expect(rangeCovering(daysAgo(30), now)).toBe("1y");
    expect(rangeCovering(daysAgo(358), now)).toBe("1y");
    expect(rangeCovering(daysAgo(359), now)).toBe("2y");
    expect(rangeCovering(daysAgo(1000), now)).toBe("5y");
    expect(rangeCovering(daysAgo(3000), now)).toBe("10y");
  });

  it("falls back to the whole history beyond ten years", () => {
    expect(rangeCovering(daysAgo(4000), now)).toBe("max");
  });
});

describe("rangeSince", () => {
  const now = new Date("2026-10-07T12:00:00.000Z");
  const daysAgo = (days: number) =>
    new Date(now.getTime() - days * 86_400_000);

  it("never asks for less than the default range", () => {
    expect(rangeSince(daysAgo(30), now)).toBe("5y");
    expect(rangeSince(null, now)).toBe("5y");
  });

  it("widens past the default when the oldest date is further back", () => {
    expect(rangeSince(daysAgo(2000), now)).toBe("10y");
    expect(rangeSince(daysAgo(4000), now)).toBe("max");
  });

  it("keeps the wider of two ranges", () => {
    expect(widerRange("1y", "5y")).toBe("5y");
    expect(widerRange("max", "2y")).toBe("max");
  });
});
