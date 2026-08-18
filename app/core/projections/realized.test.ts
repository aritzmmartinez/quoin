import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import type { LedgerEvent, Sleeve, TradeEvent } from "../domain";

import { computePortfolioSummary } from "./portfolio";
import { computePositions } from "./positions";
import { computeRealizedGains } from "./realized";

let seq = 0;

function trade(
  type: "BUY" | "SELL",
  instrumentId: string,
  quantity: string,
  grossAmount: string,
  opts: { fees?: string; sleeve?: Sleeve; ts?: string; fxToBase?: string } = {},
): TradeEvent {
  return {
    id: `evt-${seq++}`,
    ts: new Date(opts.ts ?? "2025-01-01"),
    type,
    instrumentId,
    sleeve: opts.sleeve ?? "CORE",
    quantity,
    price: "0",
    grossAmount,
    fees: opts.fees ?? "0",
    currency: "EUR",
    fxToBase: opts.fxToBase ?? "1",
    account: "test",
    source: "TEST",
  };
}

function only(sales: ReturnType<typeof computeRealizedGains>) {
  expect(sales).toHaveLength(1);
  return sales[0]!;
}

function sumRealized(sales: ReturnType<typeof computeRealizedGains>): Decimal {
  return sales.reduce(
    (total, sale) => total.plus(new Decimal(sale.realizedPnL)),
    new Decimal(0),
  );
}

describe("computeRealizedGains", () => {
  it("reports nothing when nothing has been sold", () => {
    expect(computeRealizedGains([])).toEqual([]);
    expect(computeRealizedGains([trade("BUY", "X", "10", "1000")])).toEqual([]);
  });

  it("values a partial sell at the average cost, leaving the rest held", () => {
    const sale = only(
      computeRealizedGains([
        trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
        trade("SELL", "X", "4", "600", { ts: "2025-03-01" }),
      ]),
    );

    expect(sale.quantity).toBe("4");
    expect(sale.price).toBe("150");
    expect(sale.grossAmount).toBe("600");
    expect(sale.costBasis).toBe("400");
    expect(sale.realizedPnL).toBe("200");
    expect(sale.returnPct).toBe("0.500000");
  });

  it("consumes the whole cost basis on a full sell", () => {
    const sale = only(
      computeRealizedGains([
        trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
        trade("SELL", "X", "10", "1200", { ts: "2025-03-01" }),
      ]),
    );

    expect(sale.costBasis).toBe("1000");
    expect(sale.realizedPnL).toBe("200");
    expect(sale.returnPct).toBe("0.200000");
  });

  it("blends buys at different prices into one average cost", () => {
    const sale = only(
      computeRealizedGains([
        trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
        trade("BUY", "X", "10", "2000", { ts: "2025-02-01" }),
        trade("SELL", "X", "15", "3000", { ts: "2025-03-01" }),
      ]),
    );

    expect(sale.costBasis).toBe("2250");
    expect(sale.realizedPnL).toBe("750");
  });

  it("subtracts the sale commission from the proceeds and keeps buy fees in the cost", () => {
    const sale = only(
      computeRealizedGains([
        trade("BUY", "X", "10", "1000", { fees: "10", ts: "2025-01-01" }),
        trade("SELL", "X", "5", "600", { fees: "5", ts: "2025-02-01" }),
      ]),
    );

    expect(sale.fees).toBe("5");
    expect(sale.grossAmount).toBe("600");
    expect(sale.costBasis).toBe("505");
    expect(sale.realizedPnL).toBe("90");
  });

  it("starts a reopened position from zero cost, not from the closed one", () => {
    const sales = computeRealizedGains([
      trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
      trade("SELL", "X", "10", "1200", { ts: "2025-02-01" }),
      trade("BUY", "X", "5", "1500", { ts: "2025-03-01" }),
      trade("SELL", "X", "5", "1600", { ts: "2025-04-01" }),
    ]);

    expect(sales).toHaveLength(2);
    expect(sales[0]!.costBasis).toBe("1000");
    expect(sales[0]!.realizedPnL).toBe("200");
    expect(sales[1]!.costBasis).toBe("1500");
    expect(sales[1]!.realizedPnL).toBe("100");
    expect(sales[1]!.holdingDays).toBe(31);
  });

  it("measures holding days from the quantity-weighted acquisition date", () => {
    const sales = computeRealizedGains([
      trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
      trade("BUY", "X", "10", "1000", { ts: "2025-01-31" }),
      trade("SELL", "X", "5", "600", { ts: "2025-02-15" }),
      trade("SELL", "X", "5", "600", { ts: "2025-03-17" }),
    ]);

    expect(sales[0]!.holdingDays).toBe(30);
    expect(sales[1]!.holdingDays).toBe(60);
  });

  it("reports no holding period for a sale with nothing to sell", () => {
    const sale = only(
      computeRealizedGains([
        trade("SELL", "X", "5", "600", { ts: "2025-02-01" }),
      ]),
    );

    expect(sale.costBasis).toBe("0");
    expect(sale.returnPct).toBeNull();
    expect(sale.holdingDays).toBeNull();
    expect(sale.realizedPnL).toBe("600");
  });

  it("converts to base currency via fxToBase", () => {
    const sale = only(
      computeRealizedGains([
        trade("BUY", "X", "10", "1000", { fxToBase: "0.9", ts: "2025-01-01" }),
        trade("SELL", "X", "10", "1200", { fxToBase: "0.9", ts: "2025-02-01" }),
      ]),
    );

    expect(sale.grossAmount).toBe("1080");
    expect(sale.costBasis).toBe("900");
    expect(sale.realizedPnL).toBe("180");
  });

  it("keeps sleeves ring-fenced and reports sales chronologically", () => {
    const sales = computeRealizedGains([
      trade("SELL", "X", "5", "700", { sleeve: "TRADING", ts: "2025-04-01" }),
      trade("BUY", "X", "10", "1000", { sleeve: "CORE", ts: "2025-01-01" }),
      trade("BUY", "X", "10", "2000", { sleeve: "TRADING", ts: "2025-02-01" }),
      trade("SELL", "X", "5", "600", { sleeve: "CORE", ts: "2025-03-01" }),
    ]);

    expect(sales.map((s) => s.sleeve)).toEqual(["CORE", "TRADING"]);
    expect(sales[0]!.costBasis).toBe("500"); // CORE average 100
    expect(sales[1]!.costBasis).toBe("1000"); // TRADING average 200
  });
});

describe("realized gains vs the portfolio total", () => {
  function expectSumMatchesSummary(events: readonly LedgerEvent[]) {
    const sales = computeRealizedGains(events);
    const summary = computePortfolioSummary(
      computePositions(events),
      new Map(),
    );

    expect(sumRealized(sales).equals(new Decimal(summary.realizedPnL))).toBe(
      true,
    );
    return { sales, summary };
  }

  it("holds for a ledger with partial, total, fee-bearing and reopened sales", () => {
    const events: LedgerEvent[] = [
      trade("BUY", "X", "10", "1000", { fees: "9.95", ts: "2025-01-01" }),
      trade("BUY", "X", "7", "1400", { fees: "1.5", ts: "2025-02-01" }),
      trade("SELL", "X", "6", "1300", { fees: "2.75", ts: "2025-03-01" }),
      trade("SELL", "X", "11", "2500", { fees: "3", ts: "2025-04-01" }),
      trade("BUY", "X", "4", "900", { ts: "2025-05-01" }),
      trade("SELL", "X", "4", "850", { fees: "1", ts: "2025-06-01" }),
      trade("BUY", "Y", "3", "600", { fees: "0.5", ts: "2025-01-15" }),
      trade("SELL", "Y", "1", "250", { ts: "2025-07-01" }),
      trade("BUY", "Z", "2", "500", { sleeve: "TRADING", ts: "2025-02-20" }),
      trade("SELL", "Z", "2", "460", { sleeve: "TRADING", ts: "2025-08-01" }),
    ];

    const { sales } = expectSumMatchesSummary(events);
    expect(sales).toHaveLength(5);
  });

  it("holds when a sale loses money", () => {
    expectSumMatchesSummary([
      trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
      trade("SELL", "X", "10", "700", { fees: "5", ts: "2025-02-01" }),
    ]);
  });

  it("holds for repeated fractional sales that never divide evenly", () => {
    const events: LedgerEvent[] = [
      trade("BUY", "BTC", "0.37", "12345.67", {
        fees: "1.23",
        ts: "2025-01-01",
      }),
      trade("BUY", "BTC", "0.113", "4321.09", {
        fees: "0.99",
        ts: "2025-02-01",
      }),
      trade("SELL", "BTC", "0.211", "9876.54", {
        fees: "2.5",
        ts: "2025-03-01",
      }),
      trade("SELL", "BTC", "0.09", "3333.33", {
        fees: "0.4",
        ts: "2025-04-01",
      }),
    ];

    expectSumMatchesSummary(events);
  });

  it("holds when the ledger carries dividends and cash movements too", () => {
    const events: LedgerEvent[] = [
      trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
      {
        id: "d1",
        ts: new Date("2025-02-01"),
        type: "DIVIDEND",
        instrumentId: "X",
        sleeve: "CORE",
        grossAmount: "50",
        taxWithheld: "10",
        currency: "EUR",
        fxToBase: "1",
        account: "test",
        source: "TEST",
      },
      {
        id: "c1",
        ts: new Date("2025-02-02"),
        type: "DEPOSIT",
        grossAmount: "1000",
        currency: "EUR",
        fxToBase: "1",
        account: "test",
        source: "TEST",
      },
      trade("SELL", "X", "5", "700", { ts: "2025-03-01" }),
    ];

    const { sales } = expectSumMatchesSummary(events);
    expect(sales).toHaveLength(1);
    expect(sales[0]!.realizedPnL).toBe("200");
  });
});
