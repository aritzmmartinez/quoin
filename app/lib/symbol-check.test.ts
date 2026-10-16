import { describe, expect, it } from "vitest";

import type { LedgerEvent } from "~/core/domain";
import type {
  HistoryRange,
  HistorySpan,
  MarketDataProvider,
  Quote,
} from "~/core/ports";

import {
  checkQuoteAgainstLedger,
  checkSymbol,
  compareTrades,
  heldQuantity,
  recentTradeMarks,
  tradeSpan,
  tradesDisagree,
  type TradeComparison,
} from "./symbol-check";

const NOW = new Date("2026-07-13T12:00:00.000Z");

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
    expect(check.foreignCurrency).toBeNull();
  });

  it("names the currency of a quote that is not in euros", () => {
    const check = checkSymbol(quote({ currency: "USD" }), "1", NOW);
    expect(check.foreignCurrency).toBe("USD");
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
    fxToBase: "1",
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

  it("is empty for an instrument never traded", () => {
    expect(recentTradeMarks([], ID)).toEqual([]);
  });
});

describe("tradeSpan", () => {
  it("covers only the trades, plus a week back for the first close", () => {
    const span = tradeSpan([
      { ts: new Date("2025-07-31T10:00:00Z"), price: "1" },
      { ts: new Date("2025-05-10T10:00:00Z"), price: "1" },
    ]);

    expect(span?.from.toISOString()).toBe("2025-05-03T10:00:00.000Z");
    expect(span?.to.toISOString()).toBe("2025-08-01T10:00:00.000Z");
  });

  it("asks for nothing when there is no trade", () => {
    expect(tradeSpan([])).toBeNull();
  });
});

describe("compareTrades", () => {
  const mark = { ts: new Date("2025-07-31T10:00:00Z"), price: "23.91" };

  it("compares with the close of the trading day", () => {
    const [row] = compareTrades(
      [mark],
      [
        close("2025-07-30T07:00:00Z", "23.50"),
        close("2025-07-31T07:00:00Z", "23.88"),
        close("2025-08-01T07:00:00Z", "30"),
      ],
    );

    expect(row).toMatchObject({ close: "23.88", traded: "23.91", off: false });
    expect(row?.deviation).toBe("-0.001255");
  });

  it("never reaches forward, and skips a trade with no close in the week before", () => {
    expect(
      compareTrades([mark], [close("2025-08-01T07:00:00Z", "23.88")]),
    ).toEqual([]);
    expect(
      compareTrades([mark], [close("2025-07-20T07:00:00Z", "23.88")]),
    ).toEqual([]);
  });

  it("marks a close far from the trade, as a wrong venue or class would give", () => {
    const [row] = compareTrades(
      [mark],
      [close("2025-07-31T07:00:00Z", "131.5")],
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
    expect(tradesDisagree([row("0.3"), row("0.01"), row("-0.02")])).toBe(
      false,
    );
  });

  it("says nothing without a comparison", () => {
    expect(tradesDisagree([])).toBe(false);
  });
});

describe("checkQuoteAgainstLedger", () => {
  function provider(
    live: Quote | null,
    history: Quote[],
  ): { provider: MarketDataProvider; asked: (HistoryRange | HistorySpan)[] } {
    const asked: (HistoryRange | HistorySpan)[] = [];
    return {
      asked,
      provider: {
        source: "FAKE",
        getQuotes: async () => (live ? [live] : []),
        getHistory: async (_symbol, range) => {
          asked.push(range);
          return history;
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
      close("2025-07-31T07:00:00Z", "23.88"),
    ]);

    const check = await checkQuoteAgainstLedger(market, events, ID, "TEST.DE");

    expect(check?.closed).toBe(true);
    expect(check?.trades).toHaveLength(2);
    expect(check?.tradesOff).toBe(false);
    expect(asked).toEqual([
      {
        from: new Date("2025-05-03T10:00:00.000Z"),
        to: new Date("2025-08-01T10:00:00.000Z"),
      },
    ]);
  });

  it("does not download any history without trades or for a quote outside euros", async () => {
    const none = provider(live, []);
    await checkQuoteAgainstLedger(none.provider, [], ID, "TEST.DE");
    expect(none.asked).toEqual([]);

    const usd = provider({ ...live, currency: "USD" }, []);
    const check = await checkQuoteAgainstLedger(
      usd.provider,
      [trade("2025-07-31T10:00:00Z", "1", "23.91")],
      ID,
      "TEST",
    );
    expect(usd.asked).toEqual([]);
    expect(check?.tradesAsked).toBe(1);
    expect(check?.trades).toEqual([]);
  });

  it("is null when the provider has no quote", async () => {
    const { provider: market } = provider(null, []);
    expect(await checkQuoteAgainstLedger(market, [], ID, "NOPE")).toBeNull();
  });
});
