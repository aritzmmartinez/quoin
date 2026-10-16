import { describe, expect, it } from "vitest";

import type { Instrument } from "~/core/domain";
import type {
  InstrumentRepository,
  MarketDataProvider,
  PriceRepository,
  PriceSnapshot,
  ReplaceHistoryOptions,
} from "~/core/ports";

import { assignQuoteSymbol, clearQuoteSymbol } from "./quote-symbol";

const INSTRUMENT: Instrument = {
  id: "XS00TEST0003",
  name: "Test Instrument",
  type: "ETF",
  currency: "EUR",
  quoteSymbol: null,
  exposureKind: null,
  exposureLeafId: null,
  ter: null,
  hedgedToBase: false,
  thesis: "CORE",
};

const SNAPSHOT: PriceSnapshot = {
  instrumentId: INSTRUMENT.id,
  price: "10",
  currency: "EUR",
  asOf: new Date("2026-10-01T07:00:00Z"),
  source: "YAHOO",
};

function quoting(currency: string | null): MarketDataProvider {
  return {
    source: "FAKE",
    getQuotes: async (symbols) =>
      currency === null
        ? []
        : symbols.map((symbol) => ({
            symbol,
            price: "100",
            currency,
            asOf: new Date("2026-10-08T14:00:00Z"),
          })),
    getHistory: async () => [],
  };
}

const EUR = quoting("EUR");

function fakes(stored: Instrument | null, history: PriceSnapshot[] = []) {
  const calls: string[] = [];
  const instruments = {
    get: async (id: string) =>
      stored && stored.id === id ? { ...stored } : null,
    setQuoteSymbol: async (_id: string, symbol: string | null) => {
      calls.push(`set:${symbol ?? "null"}`);
    },
  } as unknown as InstrumentRepository;
  const prices = {
    latest: async () =>
      new Map(history.map((s) => [s.instrumentId, s] as const)),
    replaceHistory: async (
      _id: string,
      snapshots: readonly PriceSnapshot[],
      options: ReplaceHistoryOptions = {},
    ) => {
      calls.push(
        `replace:${snapshots.length}:${String(options.quoteSymbol)}`,
      );
      return history.length;
    },
  } as unknown as PriceRepository;
  return { calls, instruments, prices };
}

describe("assignQuoteSymbol", () => {
  it("stores a first symbol on an instrument with no prices", async () => {
    const { calls, instruments, prices } = fakes(INSTRUMENT);

    const result = await assignQuoteSymbol(
      instruments,
      prices,
      EUR,
      INSTRUMENT.id,
      "NEW.DE",
    );

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual(["set:NEW.DE"]);
  });

  it("lets the wizard correct a symbol saved a moment ago, before any price exists", async () => {
    const { calls, instruments, prices } = fakes({
      ...INSTRUMENT,
      quoteSymbol: "WRONG.DE",
    });

    await assignQuoteSymbol(
      instruments,
      prices,
      EUR,
      INSTRUMENT.id,
      "NEW.DE",
    );

    expect(calls).toEqual(["set:NEW.DE"]);
  });

  it("refuses to drop an existing history: that goes through the replacement", async () => {
    const { calls, instruments, prices } = fakes(
      { ...INSTRUMENT, quoteSymbol: "OLD.DE" },
      [SNAPSHOT],
    );

    const result = await assignQuoteSymbol(
      instruments,
      prices,
      EUR,
      INSTRUMENT.id,
      "NEW.DE",
    );

    expect(result).toEqual({ ok: false, reason: "has-history" });
    expect(calls).toEqual([]);
  });

  it("accepts the symbol already stored without touching anything", async () => {
    const { calls, instruments, prices } = fakes(
      { ...INSTRUMENT, quoteSymbol: "OLD.DE" },
      [SNAPSHOT],
    );

    const result = await assignQuoteSymbol(
      instruments,
      prices,
      EUR,
      INSTRUMENT.id,
      "OLD.DE",
    );

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([]);
  });

  it("refuses a symbol that does not quote in euros, whoever calls it", async () => {
    const { calls, instruments, prices } = fakes(INSTRUMENT);

    const result = await assignQuoteSymbol(
      instruments,
      prices,
      quoting("USD"),
      INSTRUMENT.id,
      "AAA",
    );

    expect(result).toEqual({ ok: false, reason: "not-eur", currency: "USD" });
    expect(calls).toEqual([]);
  });

  it("refuses a symbol the provider does not quote at all", async () => {
    const { calls, instruments, prices } = fakes(INSTRUMENT);

    const result = await assignQuoteSymbol(
      instruments,
      prices,
      quoting(null),
      INSTRUMENT.id,
      "NOPE.DE",
    );

    expect(result).toEqual({ ok: false, reason: "no-quote" });
    expect(calls).toEqual([]);
  });

  it("refuses an unknown instrument without touching anything", async () => {
    const { calls, instruments, prices } = fakes(null);

    await expect(
      assignQuoteSymbol(instruments, prices, EUR, "NOPE", "NEW.DE"),
    ).rejects.toThrow(/NOPE/);
    expect(calls).toEqual([]);
  });
});

describe("clearQuoteSymbol", () => {
  it("clears the symbol and its prices in one replacement", async () => {
    const { calls, instruments, prices } = fakes(
      { ...INSTRUMENT, quoteSymbol: "OLD.DE" },
      [SNAPSHOT],
    );

    const removed = await clearQuoteSymbol(instruments, prices, INSTRUMENT.id);

    expect(removed).toBe(1);
    expect(calls).toEqual(["replace:0:null"]);
  });
});
