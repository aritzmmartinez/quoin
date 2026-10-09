import { describe, expect, it } from "vitest";

import type { Instrument } from "~/core/domain";
import type {
  HistoryRange,
  InstrumentRepository,
  MarketDataProvider,
  PriceRepository,
  PriceSnapshot,
  Quote,
  ReplaceHistoryOptions,
} from "~/core/ports";

import { es } from "./i18n";
import {
  replaceFailureMessage,
  replaceQuoteHistories,
  replaceQuoteHistory,
  type ReplaceOutcome,
} from "./price-history";

const NOW = new Date("2026-10-08T15:00:00.000Z");
const day = (iso: string, hour = 7) =>
  new Date(`${iso}T${String(hour).padStart(2, "0")}:00:00.000Z`);

const INSTRUMENT: Instrument = {
  id: "XS00TEST0003",
  name: "Synthetic Fund",
  type: "ETF",
  currency: "EUR",
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
    getQuotes: async (symbols) =>
      live.filter((q) => symbols.includes(q.symbol)),
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
      { instruments, prices, provider: provider({}), now: NOW },
      { instrumentId: INSTRUMENT.id, symbol: "NEW.DE", range: "5y" },
    );

    expect(outcome).toMatchObject({ ok: false, reason: "no-history" });
    expect(state.replaced).toBe(0);
    expect(state.rows).toEqual(COARSE_OLD);
    expect(state.symbol).toBe("AAA.DE");
  });

  it("leaves every candle alone when the provider fails outright", async () => {
    const { state, instruments, prices } = store(COARSE_OLD);

    const outcome = await replaceQuoteHistory(
      {
        instruments,
        prices,
        provider: provider({ "AAA.DE": new Error("rate limited") }),
        now: NOW,
      },
      { instrumentId: INSTRUMENT.id, symbol: "AAA.DE", range: "5y" },
    );

    expect(outcome).toMatchObject({ ok: false, reason: "no-history" });
    expect(state.replaced).toBe(0);
    expect(state.rows).toEqual(COARSE_OLD);
  });

  it("refuses a history that is not in euros without touching anything", async () => {
    const { state, instruments, prices } = store(COARSE_OLD);
    const usd = DAILY_NEW("AAA").map((q) => ({ ...q, currency: "USD" }));

    const outcome = await replaceQuoteHistory(
      {
        instruments,
        prices,
        provider: provider({ AAA: usd }),
        now: NOW,
      },
      { instrumentId: INSTRUMENT.id, symbol: "AAA", range: "5y" },
    );

    expect(outcome).toMatchObject({
      ok: false,
      reason: "not-eur",
      currency: "USD",
    });
    expect(state.replaced).toBe(0);
    expect(state.rows).toEqual(COARSE_OLD);
    expect(state.symbol).toBe("AAA.DE");
  });

  it("on a new symbol keeps only its daily candles plus today's quote", async () => {
    const { state, instruments, prices } = store(COARSE_OLD);
    const live = quote("NEW.DE", day("2026-10-08", 14), "103");

    const outcome = await replaceQuoteHistory(
      {
        instruments,
        prices,
        provider: provider({ "NEW.DE": DAILY_NEW("NEW.DE") }, [live]),
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
    expect(state.rows.map((r) => [r.asOf.toISOString(), r.price])).toEqual([
      ["2026-10-05T07:00:00.000Z", "100"],
      ["2026-10-06T07:00:00.000Z", "101"],
      ["2026-10-07T07:00:00.000Z", "102"],
      ["2026-10-08T14:00:00.000Z", "103"],
    ]);
  });

  it("does not let latest() move back when today's quote is fresh", async () => {
    const { state, instruments, prices, latest } = store(COARSE_OLD);
    const before = latest()!.asOf;
    const live = quote("AAA.DE", day("2026-10-08", 14), "103");

    await replaceQuoteHistory(
      {
        instruments,
        prices,
        provider: provider({ "AAA.DE": DAILY_NEW("AAA.DE") }, [live]),
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
        instruments,
        prices,
        provider: provider({ "AAA.DE": DAILY_NEW("AAA.DE") }, [stale]),
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
        instruments,
        prices,
        provider: provider({ "NEW.DE": DAILY_NEW("NEW.DE") }),
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
        instruments,
        prices,
        provider: provider({ "AAA.DE": DAILY_NEW("AAA.DE") }, [old]),
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
        instruments,
        prices,
        provider: provider({ "AAA.DE": repeated }),
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
        { instruments, prices, provider: provider({}), now: NOW },
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
        instruments,
        prices,
        provider: provider({
          "AAA.DE": DAILY_NEW("AAA.DE"),
          "BAD.DE": new Error("boom"),
          "CCC.DE": DAILY_NEW("CCC.DE"),
        }),
        now: NOW,
      },
      [
        { instrumentId: INSTRUMENT.id, symbol: "AAA.DE", range: "5y" },
        { instrumentId: "MISSING", symbol: "BAD.DE", range: "5y" },
        { instrumentId: INSTRUMENT.id, symbol: "BAD.DE", range: "5y" },
        { instrumentId: INSTRUMENT.id, symbol: "CCC.DE", range: "5y" },
      ],
      (_outcome, index) => seen.push(index),
    );

    expect(outcomes.map((o) => (o.ok ? "ok" : o.reason))).toEqual([
      "ok",
      "failed",
      "no-history",
      "ok",
    ]);
    expect(seen).toEqual([0, 1, 2, 3]);
  });
});

describe("replaceFailureMessage", () => {
  const failure = (
    reason: "no-history" | "not-eur" | "failed",
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
    expect(replaceFailureMessage(es, failure("not-eur", "USD"))).toContain(
      "USD",
    );
    expect(replaceFailureMessage(es, failure("failed"))).toBe(
      es.instruments.history.failed,
    );
  });
});
