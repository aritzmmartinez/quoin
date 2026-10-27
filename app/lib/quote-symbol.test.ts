import { describe, expect, it } from "vitest";

import type { Instrument } from "~/core/domain";
import {
  MarketDataUnavailableError,
  type InstrumentRepository,
  type MarketDataProvider,
  type PriceRepository,
  type PriceSnapshot,
  type ReplaceHistoryOptions,
} from "~/core/ports";

import { rateBookFrom } from "~/core/fx";

import type { EnsureRates } from "./fx-sync";
import { assignQuoteSymbol, clearQuoteSymbol } from "./quote-symbol";

const MADRID = "Europe/Madrid";

const NOW = new Date("2026-10-08T15:00:00Z");
const NO_RATES: EnsureRates = async () => ({ book: new Map(), unavailable: [] });

const INSTRUMENT: Instrument = {
  id: "XS00TEST0003",
  name: "Test Instrument",
  type: "ETF",
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
    getQuote: async (symbol) =>
      currency === null
        ? null
        : {
            symbol,
            price: "100",
            currency,
            asOf: new Date("2026-10-08T14:00:00Z"),
          },
    getHistory: async () => (currency === null ? [] : [SNAPSHOT_QUOTE]),
  };
}

const SNAPSHOT_QUOTE = {
  symbol: "NEW.DE",
  price: "100",
  currency: "EUR",
  asOf: new Date("2026-10-07T07:00:00Z"),
};

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
  it("refuses a symbol Yahoo quotes but has no daily history for", async () => {
    const { calls, instruments, prices } = fakes(INSTRUMENT);
    const sg: MarketDataProvider = { ...EUR, getHistory: async () => [] };

    const result = await assignQuoteSymbol(
      instruments,
      prices,
      sg,
      INSTRUMENT.id,
      "XS00TEST0001.SG",
      NO_RATES,
      MADRID,
    );

    expect(result).toEqual({ ok: false, reason: "no-history" });
    expect(calls).toEqual([]);
  });

  it("stores nothing when Yahoo cannot be asked, and says so by throwing", async () => {
    const { calls, instruments, prices } = fakes(INSTRUMENT);
    const busy: MarketDataProvider = {
      source: "FAKE",
      getQuote: async (symbol) => {
        throw new MarketDataUnavailableError(symbol, 503);
      },
      getHistory: async () => [],
    };

    await expect(
      assignQuoteSymbol(
        instruments,
        prices,
        busy,
        INSTRUMENT.id,
        "NEW.DE",
        NO_RATES,
        MADRID,
      ),
    ).rejects.toBeInstanceOf(MarketDataUnavailableError);
    expect(calls).toEqual([]);
  });

  it("stores a first symbol on an instrument with no prices", async () => {
    const { calls, instruments, prices } = fakes(INSTRUMENT);

    const result = await assignQuoteSymbol(
      instruments,
      prices,
      EUR,
      INSTRUMENT.id,
      "NEW.DE",
      NO_RATES,
      MADRID,
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
      NO_RATES,
      MADRID,
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
      NO_RATES,
      MADRID,
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
      NO_RATES,
      MADRID,
    );

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([]);
  });

  it("stores a symbol quoted in another currency the ECB publishes, asking for its last month", async () => {
    const { calls, instruments, prices } = fakes(INSTRUMENT);
    const asked: [string, string][] = [];
    const rates: EnsureRates = async (needs) => {
      asked.push(...needs);
      return {
        book: rateBookFrom([
          { source: "ECB", base: "EUR", quote: "USD", day: "2026-10-07", rate: "1.1" },
        ]),
        unavailable: [],
      };
    };

    const result = await assignQuoteSymbol(
      instruments,
      prices,
      quoting("USD"),
      INSTRUMENT.id,
      "AAA",
      rates,
      MADRID,
      NOW,
    );

    expect(result).toEqual({ ok: true });
    expect(asked).toEqual([["USD", "2026-09-08"]]);
    expect(calls).toEqual(["set:AAA"]);
  });

  it("refuses a symbol in a currency the ECB publishes no rates for, whoever calls it", async () => {
    const { calls, instruments, prices } = fakes(INSTRUMENT);

    const result = await assignQuoteSymbol(
      instruments,
      prices,
      quoting("XYZ"),
      INSTRUMENT.id,
      "AAA",
      NO_RATES,
      MADRID,
    );

    expect(result).toEqual({
      ok: false,
      reason: "no-rate-series",
      currency: "XYZ",
    });
    expect(calls).toEqual([]);
  });

  it("refuses rather than guess when the ECB cannot be reached for that currency", async () => {
    const { calls, instruments, prices } = fakes(INSTRUMENT);

    const result = await assignQuoteSymbol(
      instruments,
      prices,
      quoting("USD"),
      INSTRUMENT.id,
      "AAA",
      async () => ({ book: new Map(), unavailable: ["USD"] }),
      MADRID,
    );

    expect(result).toEqual({
      ok: false,
      reason: "rates-unavailable",
      currency: "USD",
    });
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
      NO_RATES,
      MADRID,
    );

    expect(result).toEqual({ ok: false, reason: "no-quote" });
    expect(calls).toEqual([]);
  });

  it("refuses an unknown instrument without touching anything", async () => {
    const { calls, instruments, prices } = fakes(null);

    await expect(
      assignQuoteSymbol(
        instruments,
        prices,
        EUR,
        "NOPE",
        "NEW.DE",
        NO_RATES,
        MADRID,
      ),
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
