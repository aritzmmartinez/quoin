import { describe, expect, it } from "vitest";

import type { Instrument } from "~/core/domain";
import {
  MarketDataUnavailableError,
  type HistoryRange,
  type InstrumentRepository,
  type MarketDataProvider,
  type PriceRepository,
  type PriceSnapshot,
  type Quote,
  type ReplaceHistoryOptions,
} from "~/core/ports";

import { rateBookFrom } from "~/core/fx";

import type { EnsureRates } from "./fx-sync";
import { es } from "./i18n";
import {
  replaceFailureMessage,
  replaceQuoteHistories,
  replaceQuoteHistory,
  type ReplaceOutcome,
} from "./price-history";

const MADRID = "Europe/Madrid";

const NOW = new Date("2026-10-08T15:00:00.000Z");

const NO_RATES: EnsureRates = async () => ({ book: new Map(), unavailable: [] });

function ratesFor(currency: string, days: string[]) {
  const asked: [string, string][] = [];
  const rates: EnsureRates = async (needs) => {
    asked.push(...needs);
    return {
      book: rateBookFrom(
        days.map((d) => ({
          source: "ECB",
          base: "EUR",
          quote: currency,
          day: d,
          rate: "1.1",
        })),
      ),
      unavailable: [],
    };
  };
  return { rates, asked };
}
const day = (iso: string, hour = 7) =>
  new Date(`${iso}T${String(hour).padStart(2, "0")}:00:00.000Z`);

const INSTRUMENT: Instrument = {
  id: "XS00TEST0003",
  name: "Synthetic Fund",
  type: "ETF",
  quoteSymbol: "AAA.DE",
  exposureKind: null,
  exposureLeafId: null,
  ter: null,
  hedgedToBase: false,
  thesis: "CORE",
};

const snap = (asOf: Date, price: string, source = "YAHOO"): PriceSnapshot => ({
  instrumentId: INSTRUMENT.id,
  price,
  currency: "EUR",
  asOf,
  source,
});

const quote = (
  symbol: string,
  asOf: Date,
  price: string,
  currency = "EUR",
): Quote => ({ symbol, price, currency, asOf });

function store(rows: PriceSnapshot[], stored: Instrument | null = INSTRUMENT) {
  const state = {
    symbol: stored?.quoteSymbol ?? null,
    rows: [...rows],
    replaced: 0,
  };
  const instruments = {
    get: async (id: string) =>
      stored && stored.id === id
        ? { ...stored, quoteSymbol: state.symbol }
        : null,
  } as unknown as InstrumentRepository;
  const prices = {
    replaceHistory: async (
      _id: string,
      snapshots: readonly PriceSnapshot[],
      options: ReplaceHistoryOptions = {},
    ) => {
      state.replaced += 1;
      const before = state.rows.length;
      const keepAfter = options.keepAfter;
      state.rows = keepAfter
        ? state.rows.filter((r) => r.asOf.getTime() > keepAfter.getTime())
        : [];
      const removed = before - state.rows.length;
      state.rows.push(...snapshots);
      if (options.quoteSymbol !== undefined) state.symbol = options.quoteSymbol;
      return removed;
    },
  } as unknown as PriceRepository;
  const latest = () =>
    [...state.rows].sort((a, b) => b.asOf.getTime() - a.asOf.getTime())[0];
  return { state, instruments, prices, latest };
}

function provider(
  history: Record<string, Quote[] | Error>,
  live: Quote[] = [],
): MarketDataProvider {
  return {
    source: "YAHOO",
    getQuote: async (symbol) => live.find((q) => q.symbol === symbol) ?? null,
    getHistory: async (symbol: string, _range: HistoryRange) => {
      const answer = history[symbol] ?? [];
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

const COARSE_OLD = [
  snap(day("2026-06-01", 0), "90"),
  snap(day("2026-07-01", 0), "95"),
  snap(day("2026-08-03", 0), "97"),
  snap(day("2026-08-03"), "96"),
  snap(day("2026-10-07", 12), "99"),
];

const DAILY_NEW = (symbol: string) => [
  quote(symbol, day("2026-10-05"), "100"),
  quote(symbol, day("2026-10-06"), "101"),
  quote(symbol, day("2026-10-07"), "102"),
];

describe("replaceQuoteHistory", () => {
  it("leaves every candle and the symbol alone when the provider returns nothing", async () => {
    const { state, instruments, prices } = store(COARSE_OLD);

    const outcome = await replaceQuoteHistory(
      {
        zone: MADRID,
        instruments,
        prices,
        provider: provider({}),
        rates: NO_RATES,
        now: NOW,
      },
      { instrumentId: INSTRUMENT.id, symbol: "NEW.DE", range: "5y" },
    );

    expect(outcome).toMatchObject({ ok: false, reason: "no-history" });
    expect(state.replaced).toBe(0);
    expect(state.rows).toEqual(COARSE_OLD);
    expect(state.symbol).toBe("AAA.DE");
  });

  it("leaves every candle alone and rethrows when the provider cannot answer", async () => {
    const { state, instruments, prices } = store(COARSE_OLD);
    const unavailable = new MarketDataUnavailableError("AAA.DE", 429);

    await expect(
      replaceQuoteHistory(
        {
          zone: MADRID,
          instruments,
          prices,
          provider: provider({ "AAA.DE": unavailable }),
          rates: NO_RATES,
          now: NOW,
        },
        { instrumentId: INSTRUMENT.id, symbol: "AAA.DE", range: "5y" },
      ),
    ).rejects.toBe(unavailable);
    expect(state.replaced).toBe(0);
    expect(state.rows).toEqual(COARSE_OLD);
  });

  it("calls an empty answer no history, without touching anything", async () => {
    const { state, instruments, prices } = store(COARSE_OLD);

    const outcome = await replaceQuoteHistory(
      {
        zone: MADRID,
        instruments,
        prices,
        provider: provider({ "AAA.DE": [] }),
        rates: NO_RATES,
        now: NOW,
      },
      { instrumentId: INSTRUMENT.id, symbol: "AAA.DE", range: "5y" },
    );

    expect(outcome).toMatchObject({ ok: false, reason: "no-history" });
    expect(state.replaced).toBe(0);
    expect(state.rows).toEqual(COARSE_OLD);
  });

  it("stores a history in another currency as it came, once the ECB publishes its rates", async () => {
    const { state, instruments, prices } = store(COARSE_OLD);
    const usd = DAILY_NEW("AAA").map((q) => ({ ...q, currency: "USD" }));
    const { rates, asked } = ratesFor("USD", ["2026-10-05"]);

    const outcome = await replaceQuoteHistory(
      {
        zone: MADRID,
        instruments,
        prices,
        provider: provider({ AAA: usd }),
        rates,
        now: NOW,
      },
      { instrumentId: INSTRUMENT.id, symbol: "AAA", range: "5y" },
    );

    expect(outcome).toMatchObject({ ok: true, written: 3 });
    expect(asked).toEqual([["USD", "2026-10-05"]]);
    expect(state.rows.map((r) => r.currency)).toEqual(["USD", "USD", "USD"]);
    expect(state.symbol).toBe("AAA");
  });

  it("refuses a history in a currency the ECB publishes no rates for, touching nothing", async () => {
    const { state, instruments, prices } = store(COARSE_OLD);
    const xyz = DAILY_NEW("AAA").map((q) => ({ ...q, currency: "XYZ" }));

    const outcome = await replaceQuoteHistory(
      {
        zone: MADRID,
        instruments,
        prices,
        provider: provider({ AAA: xyz }),
        rates: NO_RATES,
        now: NOW,
      },
      { instrumentId: INSTRUMENT.id, symbol: "AAA", range: "5y" },
    );

    expect(outcome).toMatchObject({
      ok: false,
      reason: "no-rate-series",
      currency: "XYZ",
    });
    expect(state.replaced).toBe(0);
    expect(state.rows).toEqual(COARSE_OLD);
    expect(state.symbol).toBe("AAA.DE");
  });

  it("refuses, touching nothing, when the ECB cannot be reached for a currency with no stored rates", async () => {
    const { state, instruments, prices } = store(COARSE_OLD);
    const usd = DAILY_NEW("AAA").map((q) => ({ ...q, currency: "USD" }));

    const outcome = await replaceQuoteHistory(
      {
        zone: MADRID,
        instruments,
        prices,
        provider: provider({ AAA: usd }),
        rates: async () => ({ book: new Map(), unavailable: ["USD"] }),
        now: NOW,
      },
      { instrumentId: INSTRUMENT.id, symbol: "AAA", range: "5y" },
    );

    expect(outcome).toMatchObject({
      ok: false,
      reason: "rates-unavailable",
      currency: "USD",
    });
    expect(state.replaced).toBe(0);
  });

  it("drops today's quote when it is in a different currency from the history", async () => {
    const { state, instruments, prices } = store([]);
    const live = quote("NEW.DE", day("2026-10-08", 14), "103", "USD");

    await replaceQuoteHistory(
      {
        zone: MADRID,
        instruments,
        prices,
        provider: provider({ "NEW.DE": DAILY_NEW("NEW.DE") }, [live]),
        rates: NO_RATES,
        now: NOW,
      },
      { instrumentId: INSTRUMENT.id, symbol: "NEW.DE", range: "5y" },
    );

    expect(state.rows.every((r) => r.currency === "EUR")).toBe(true);
    expect(state.rows).toHaveLength(3);
  });

  it("on a new symbol keeps only its daily candles plus today's quote", async () => {
    const { state, instruments, prices } = store(COARSE_OLD);
    const live = quote("NEW.DE", day("2026-10-08", 14), "103");

    const outcome = await replaceQuoteHistory(
      {
        zone: MADRID,
        instruments,
        prices,
        provider: provider({ "NEW.DE": DAILY_NEW("NEW.DE") }, [live]),
        rates: NO_RATES,
        now: NOW,
      },
      { instrumentId: INSTRUMENT.id, symbol: "NEW.DE", range: "5y" },
    );

    expect(outcome).toMatchObject({
      ok: true,
      removed: COARSE_OLD.length,
      written: 4,
      live: true,
    });
    expect(state.symbol).toBe("NEW.DE");
    expect(
      state.rows.map((r) => [r.asOf.toISOString(), r.price, r.source]),
    ).toEqual([
      ["2026-10-05T07:00:00.000Z", "100", "YAHOO"],
      ["2026-10-06T07:00:00.000Z", "101", "YAHOO"],
      ["2026-10-07T07:00:00.000Z", "102", "YAHOO"],
      ["2026-10-08T14:00:00.000Z", "103", "YAHOO_LIVE"],
    ]);
  });

  it("does not let latest() move back when today's quote is fresh", async () => {
    const { state, instruments, prices, latest } = store(COARSE_OLD);
    const before = latest()!.asOf;
    const live = quote("AAA.DE", day("2026-10-08", 14), "103");

    await replaceQuoteHistory(
      {
        zone: MADRID,
        instruments,
        prices,
        provider: provider({ "AAA.DE": DAILY_NEW("AAA.DE") }, [live]),
        rates: NO_RATES,
        now: NOW,
      },
      { instrumentId: INSTRUMENT.id, symbol: "AAA.DE", range: "5y" },
    );

    expect(latest()!.asOf.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(state.rows).toHaveLength(4);
  });

  it("keeps the rows newer than the last candle when today's quote is stale and the symbol is unchanged", async () => {
    const newer = snap(day("2026-10-08", 9), "104");
    const { state, instruments, prices, latest } = store([
      ...COARSE_OLD,
      newer,
    ]);
    const stale = quote("AAA.DE", day("2026-09-01", 14), "80");

    const outcome = await replaceQuoteHistory(
      {
        zone: MADRID,
        instruments,
        prices,
        provider: provider({ "AAA.DE": DAILY_NEW("AAA.DE") }, [stale]),
        rates: NO_RATES,
        now: NOW,
      },
      { instrumentId: INSTRUMENT.id, symbol: "AAA.DE", range: "5y" },
    );

    expect(outcome).toMatchObject({ ok: true, live: false });
    expect(latest()).toEqual(newer);
    expect(state.rows.map((r) => r.price).sort()).toEqual([
      "100",
      "101",
      "102",
      "104",
      "99",
    ]);
  });

  it("lets latest() fall back to the last candle when the symbol changed and there is no quote", async () => {
    const { state, instruments, prices, latest } = store(COARSE_OLD);

    await replaceQuoteHistory(
      {
        zone: MADRID,
        instruments,
        prices,
        provider: provider({ "NEW.DE": DAILY_NEW("NEW.DE") }),
        rates: NO_RATES,
        now: NOW,
      },
      { instrumentId: INSTRUMENT.id, symbol: "NEW.DE", range: "5y" },
    );

    expect(state.rows).toHaveLength(3);
    expect(latest()!.price).toBe("102");
  });

  it("ignores a quote that is not newer than the last candle", async () => {
    const { state, instruments, prices } = store([]);
    const old = quote("AAA.DE", day("2026-10-07", 6), "50");

    const outcome = await replaceQuoteHistory(
      {
        zone: MADRID,
        instruments,
        prices,
        provider: provider({ "AAA.DE": DAILY_NEW("AAA.DE") }, [old]),
        rates: NO_RATES,
        now: NOW,
      },
      { instrumentId: INSTRUMENT.id, symbol: "AAA.DE", range: "5y" },
    );

    expect(outcome).toMatchObject({ ok: true, live: false, written: 3 });
    expect(state.rows.map((r) => r.price)).not.toContain("50");
  });

  it("writes a candle the provider repeated only once", async () => {
    const { state, instruments, prices } = store([]);
    const repeated = [...DAILY_NEW("AAA.DE"), DAILY_NEW("AAA.DE")[2]!];

    await replaceQuoteHistory(
      {
        zone: MADRID,
        instruments,
        prices,
        provider: provider({ "AAA.DE": repeated }),
        rates: NO_RATES,
        now: NOW,
      },
      { instrumentId: INSTRUMENT.id, symbol: "AAA.DE", range: "5y" },
    );

    expect(state.rows).toHaveLength(3);
  });

  it("refuses an unknown instrument before asking the provider", async () => {
    const { state, instruments, prices } = store(COARSE_OLD, null);

    await expect(
      replaceQuoteHistory(
        {
          zone: MADRID,
          instruments,
          prices,
          provider: provider({}),
          rates: NO_RATES,
          now: NOW,
        },
        { instrumentId: "NOPE", symbol: "AAA.DE", range: "5y" },
      ),
    ).rejects.toThrow(/NOPE/);
    expect(state.replaced).toBe(0);
  });
});

describe("replaceQuoteHistories", () => {
  it("carries on past a failure and reports it in place", async () => {
    const { instruments, prices } = store([]);
    const seen: number[] = [];

    const outcomes = await replaceQuoteHistories(
      {
        zone: MADRID,
        instruments,
        prices,
        provider: provider({
          "AAA.DE": DAILY_NEW("AAA.DE"),
          "BAD.DE": new Error("boom"),
          "BUSY.DE": new MarketDataUnavailableError("BUSY.DE", 503),
          "CCC.DE": DAILY_NEW("CCC.DE"),
        }),
        rates: NO_RATES,
        now: NOW,
      },
      [
        { instrumentId: INSTRUMENT.id, symbol: "AAA.DE", range: "5y" },
        { instrumentId: "MISSING", symbol: "BAD.DE", range: "5y" },
        { instrumentId: INSTRUMENT.id, symbol: "BAD.DE", range: "5y" },
        { instrumentId: INSTRUMENT.id, symbol: "BUSY.DE", range: "5y" },
        { instrumentId: INSTRUMENT.id, symbol: "NONE.DE", range: "5y" },
        { instrumentId: INSTRUMENT.id, symbol: "CCC.DE", range: "5y" },
      ],
      (_outcome, index) => seen.push(index),
    );

    expect(outcomes.map((o) => (o.ok ? "ok" : o.reason))).toEqual([
      "ok",
      "failed",
      "failed",
      "unavailable",
      "no-history",
      "ok",
    ]);
    expect(seen).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("replaceFailureMessage", () => {
  const failure = (
    reason:
      | "no-history"
      | "no-rate-series"
      | "rates-unavailable"
      | "unavailable"
      | "failed",
    currency: string | null = null,
  ): Extract<ReplaceOutcome, { ok: false }> => ({
    ok: false,
    instrumentId: INSTRUMENT.id,
    symbol: "AAA",
    reason,
    currency,
  });

  it("says that nothing was touched and why", () => {
    expect(replaceFailureMessage(es, failure("no-history"))).toContain("AAA");
    expect(
      replaceFailureMessage(es, failure("no-rate-series", "XYZ")),
    ).toBe(es.fx.noRateSeriesHistory("AAA", "XYZ"));
    expect(replaceFailureMessage(es, failure("rates-unavailable", "USD"))).toBe(
      es.fx.sync.unavailable,
    );
    expect(replaceFailureMessage(es, failure("failed"))).toBe(
      es.instruments.history.failed,
    );
    expect(replaceFailureMessage(es, failure("unavailable"))).toBe(
      es.common.marketDataUnavailable,
    );
  });
});
