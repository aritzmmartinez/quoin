import { describe, expect, it } from "vitest";

import type { LedgerEvent } from "~/core/domain";
import { rateBookFrom } from "~/core/fx";
import type {
  HistoryRange,
  HistorySpan,
  MarketDataProvider,
  Quote,
} from "~/core/ports";

import {
  checkQuoteAgainstLedger,
  checkSymbol,
  DAILY_HISTORY_PROBE,
  compareTrades,
  heldQuantity,
  recentTradeMarks,
  tradeSpan,
  tradesDisagree,
  type TradeComparison,
} from "./symbol-check";
import type { EnsureRates } from "./fx-sync";

const NOW = new Date("2026-07-13T12:00:00.000Z");

const NO_RATES: EnsureRates = async () => ({ book: new Map(), unavailable: [] });

const USD_BOOK = rateBookFrom([
  { source: "ECB", base: "EUR", quote: "USD", day: "2025-07-31", rate: "1.25" },
]);

const quote = (over: Partial<Quote> = {}): Quote => ({
  symbol: "TEST.DE",
  price: "118.420000",
  currency: "EUR",
  asOf: new Date("2026-07-13T09:00:00.000Z"),
  ...over,
});

describe("checkSymbol", () => {
  it("reports the implied value of the position, not just the price", () => {
    const check = checkSymbol(quote(), "12.5", NOW);

    expect(check.impliedValue).toBe("1480.25");
    expect(check.currency).toBe("EUR");
    expect(check.fresh).toBe(true);
    expect(check.closed).toBe(false);
    expect(check.rateSeries).toBe("base");
  });

  it("carries whether the ECB publishes rates for a quote not in euros", () => {
    const usd = quote({ currency: "USD" });
    expect(checkSymbol(usd, "1", NOW, [], 0, true, "published").rateSeries).toBe(
      "published",
    );
    expect(checkSymbol(usd, "1", NOW, [], 0, true, "none").rateSeries).toBe(
      "none",
    );
  });

  it("flags a stale market timestamp — the mark of a wrong or illiquid venue", () => {
    const stale = checkSymbol(
      quote({ asOf: new Date("2026-06-01T09:00:00.000Z") }),
      "1",
      NOW,
    );

    expect(stale.fresh).toBe(false);
  });

  it("marks a closed position, where the implied value verifies nothing", () => {
    const check = checkSymbol(quote(), "0", NOW);

    expect(check.closed).toBe(true);
    expect(check.impliedValue).toBe("0.00");
  });

  it("multiplies in decimal, never in floating point", () => {
    const check = checkSymbol(quote({ price: "0.1" }), "0.2", NOW);

    expect(check.impliedValue).toBe("0.02");
  });
});

describe("heldQuantity", () => {
  it("sums every position of the instrument and ignores the rest", () => {
    const positions = [
      { instrumentId: "A", quantity: "1.5" },
      { instrumentId: "B", quantity: "9" },
      { instrumentId: "A", quantity: "2.25" },
    ];

    expect(heldQuantity(positions, "A")).toBe("3.75");
  });

  it("is zero for an instrument with no position", () => {
    expect(heldQuantity([], "A")).toBe("0");
  });
});

const ID = "XS00TEST0003";

function trade(
  iso: string,
  quantity: string,
  grossAmount: string,
  over: Partial<Extract<LedgerEvent, { type: "BUY" | "SELL" }>> = {},
): LedgerEvent {
  return {
    id: `t-${iso}-${over.type ?? "BUY"}`,
    ts: new Date(iso),
    type: "BUY",
    instrumentId: ID,
    quantity,
    price: "0",
    grossAmount,
    fees: "1",
    currency: "EUR",
    account: "test",
    source: "TEST",
    externalId: null,
    note: null,
    ...over,
  };
}

const close = (iso: string, price: string, currency = "EUR"): Quote => ({
  symbol: "TEST.DE",
  price,
  currency,
  asOf: new Date(iso),
});

describe("recentTradeMarks", () => {
  it("takes the latest buys and sells of the instrument at the broker's own price", () => {
    const marks = recentTradeMarks(
      [
        trade("2025-01-10T10:00:00Z", "2", "40"),
        trade("2025-05-10T10:00:00Z", "4", "95.64"),
        trade("2025-06-10T10:00:00Z", "1", "24", { type: "SELL" }),
        trade("2025-07-31T10:00:00Z", "10", "239.10"),
        trade("2025-08-01T10:00:00Z", "1", "999", { instrumentId: "OTHER" }),
        trade("2025-08-02T10:00:00Z", "1", "999", { note: "kraken-reward" }),
        trade("2025-08-03T10:00:00Z", "1", "999", { currency: "USD" }),
      ],
      ID,
    );

    const rows = marks.map((m) => [m.ts.toISOString().slice(0, 10), m.price]);
    expect(rows).toEqual([
      ["2025-07-31", "23.91"],
      ["2025-06-10", "24"],
      ["2025-05-10", "23.91"],
    ]);
  });

  it("takes a trade booked in another currency at its euro amount", () => {
    const [mark] = recentTradeMarks(
      [
        trade("2025-07-31T10:00:00Z", "10", "298.88", {
          currency: "USD",
          fxSource: "ECB",
          fxRate: "1.25",
          fxDirection: "QUOTE_PER_BASE",
          fxDate: "2025-07-31",
        }),
      ],
      ID,
    );

    expect(mark?.price).toBe("23.91");
  });

  it("is empty for an instrument never traded", () => {
    expect(recentTradeMarks([], ID)).toEqual([]);
  });
});

describe("tradeSpan", () => {
  it("covers only the trades, plus a week and a candle back for the first close", () => {
    const span = tradeSpan([
      { ts: new Date("2025-07-31T10:00:00Z"), price: "1" },
      { ts: new Date("2025-05-10T10:00:00Z"), price: "1" },
    ]);

    expect(span?.from.toISOString()).toBe("2025-05-02T10:00:00.000Z");
    expect(span?.to.toISOString()).toBe("2025-08-01T10:00:00.000Z");
  });

  it("asks for nothing when there is no trade", () => {
    expect(tradeSpan([])).toBeNull();
  });
});

describe("compareTrades", () => {
  const mark = { ts: new Date("2025-07-31T10:00:00Z"), price: "23.91" };

  it("compares with the close of the last day that has ended", () => {
    const [row] = compareTrades(
      [mark],
      [
        close("2025-07-29T07:00:00Z", "23.50"),
        close("2025-07-30T07:00:00Z", "23.88"),
        close("2025-07-31T07:00:00Z", "30"),
      ],
    );

    expect(row).toMatchObject({ close: "23.88", traded: "23.91", off: false });
    expect(row?.deviation).toBe("-0.001255");
  });

  it("never takes the candle of the trade's own day, whose close came later", () => {
    expect(
      compareTrades([mark], [close("2025-07-31T07:00:00Z", "23.88")]),
    ).toEqual([]);
  });

  it("never reaches forward, and skips a trade with no close in the week before", () => {
    expect(
      compareTrades([mark], [close("2025-08-01T07:00:00Z", "23.88")]),
    ).toEqual([]);
    expect(
      compareTrades([mark], [close("2025-07-20T07:00:00Z", "23.88")]),
    ).toEqual([]);
  });

  it("converts a close in another currency at the ECB rate of the trade's day", () => {
    const [row] = compareTrades(
      [mark],
      [close("2025-07-30T07:00:00Z", "29.85", "USD")],
      USD_BOOK,
    );

    expect(row).toMatchObject({ close: "23.88", off: false });
  });

  it("skips a trade whose day has no rate rather than compare across currencies", () => {
    expect(
      compareTrades([mark], [close("2025-07-31T07:00:00Z", "29.85", "USD")]),
    ).toEqual([]);
  });

  it("marks a close far from the trade, as a wrong venue or class would give", () => {
    const [row] = compareTrades(
      [mark],
      [close("2025-07-30T07:00:00Z", "131.5")],
    );
    expect(row?.off).toBe(true);
  });
});

describe("tradesDisagree", () => {
  const row = (deviation: string): TradeComparison => ({
    ts: "2025-07-31T10:00:00.000Z",
    traded: "1",
    close: "1",
    deviation,
    off: false,
  });

  it("warns when the typical trade is more than 10% away", () => {
    expect(tradesDisagree([row("4.5"), row("4.4"), row("0.01")])).toBe(true);
    expect(tradesDisagree([row("-0.6")])).toBe(true);
  });

  it("tolerates one odd trade among ones that match", () => {
    expect(tradesDisagree([row("0.3"), row("0.01"), row("-0.02")])).toBe(false);
  });

  it("says nothing without a comparison", () => {
    expect(tradesDisagree([])).toBe(false);
  });
});

describe("checkQuoteAgainstLedger", () => {
  function provider(
    live: Quote | null,
    history: Quote[] | ((range: HistoryRange | HistorySpan) => Quote[]),
  ): { provider: MarketDataProvider; asked: (HistoryRange | HistorySpan)[] } {
    const asked: (HistoryRange | HistorySpan)[] = [];
    return {
      asked,
      provider: {
        source: "FAKE",
        getQuote: async () => live,
        getHistory: async (_symbol, range) => {
          asked.push(range);
          return typeof history === "function" ? history(range) : history;
        },
      },
    };
  }

  const live = close("2026-10-08T14:00:00Z", "25.10");

  it("checks a closed position against its trades, asking only for their dates", async () => {
    const events = [
      trade("2025-05-10T10:00:00Z", "4", "95.64"),
      trade("2025-07-31T10:00:00Z", "4", "95.64", { type: "SELL" }),
    ];
    const { provider: market, asked } = provider(live, [
      close("2025-05-09T07:00:00Z", "23.90"),
      close("2025-07-30T07:00:00Z", "23.88"),
    ]);

    const check = await checkQuoteAgainstLedger(
      market,
      events,
      ID,
      "TEST.DE",
      NO_RATES,
    );

    expect(check?.closed).toBe(true);
    expect(check?.trades).toHaveLength(2);
    expect(check?.tradesOff).toBe(false);
    expect(asked).toEqual([
      {
        from: new Date("2025-05-02T10:00:00.000Z"),
        to: new Date("2025-08-01T10:00:00.000Z"),
      },
    ]);
  });

  it("without trades asks only whether a daily history exists", async () => {
    const none = provider(live, [close("2026-10-07T07:00:00Z", "25.00")]);
    const check = await checkQuoteAgainstLedger(
      none.provider,
      [],
      ID,
      "TEST.DE",
      NO_RATES,
    );
    expect(none.asked).toEqual([DAILY_HISTORY_PROBE]);
    expect(check?.dailyHistory).toBe(true);
  });

  it("refuses a symbol Yahoo quotes but has no daily candle for", async () => {
    const sg = provider(live, []);
    const check = await checkQuoteAgainstLedger(
      sg.provider,
      [trade("2025-07-31T10:00:00Z", "1", "23.91")],
      ID,
      "XS00TEST0001.SG",
      NO_RATES,
    );

    expect(check?.dailyHistory).toBe(false);
    expect(sg.asked).toHaveLength(2);
    expect(sg.asked[1]).toBe(DAILY_HISTORY_PROBE);
  });

  it("keeps a history with no candle on the trade dates apart from no history", async () => {
    const recentOnly = provider(live, (range) =>
      range === DAILY_HISTORY_PROBE
        ? [close("2026-10-07T07:00:00Z", "25.00")]
        : [],
    );
    const check = await checkQuoteAgainstLedger(
      recentOnly.provider,
      [trade("2019-07-31T10:00:00Z", "1", "23.91")],
      ID,
      "TEST.DE",
      NO_RATES,
    );

    expect(check?.dailyHistory).toBe(true);
    expect(check?.tradesAsked).toBe(1);
    expect(check?.trades).toEqual([]);
  });

  it("compares a quote in another currency against the trades in euros, asking for the rates of their span", async () => {
    const usd = provider({ ...live, currency: "USD" }, [
      close("2025-07-30T07:00:00Z", "29.85", "USD"),
    ]);
    const asked: [string, string][] = [];
    const rates: EnsureRates = async (needs) => {
      asked.push(...needs);
      return { book: USD_BOOK, unavailable: [] };
    };

    const check = await checkQuoteAgainstLedger(
      usd.provider,
      [trade("2025-07-31T10:00:00Z", "1", "23.91")],
      ID,
      "TEST",
      rates,
    );

    expect(asked).toEqual([["USD", "2025-07-23"]]);
    expect(check?.rateSeries).toBe("published");
    expect(check?.trades).toMatchObject([{ close: "23.88", off: false }]);
  });

  it("asks for no trade history for a currency the ECB publishes no rates for", async () => {
    const xyz = provider({ ...live, currency: "XYZ" }, [
      close("2026-10-07T07:00:00Z", "25.00", "XYZ"),
    ]);
    const check = await checkQuoteAgainstLedger(
      xyz.provider,
      [trade("2025-07-31T10:00:00Z", "1", "23.91")],
      ID,
      "TEST",
      NO_RATES,
    );

    expect(xyz.asked).toEqual([DAILY_HISTORY_PROBE]);
    expect(check?.rateSeries).toBe("none");
    expect(check?.trades).toEqual([]);
  });

  it("is null when the provider has no quote", async () => {
    const { provider: market } = provider(null, []);
    expect(
      await checkQuoteAgainstLedger(market, [], ID, "NOPE", NO_RATES),
    ).toBeNull();
  });
});
