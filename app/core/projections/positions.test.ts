import { describe, it, expect } from "vitest";
import { computePositions } from "./positions";
import type { LedgerEvent, TradeEvent, Sleeve } from "../domain";

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

function only(positions: ReturnType<typeof computePositions>) {
  expect(positions).toHaveLength(1);
  return positions[0]!;
}

describe("computePositions (AVCO)", () => {
  it("returns nothing for an empty ledger", () => {
    expect(computePositions([])).toEqual([]);
  });

  it("computes weighted-average cost across buys", () => {
    const p = only(
      computePositions([
        trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
        trade("BUY", "X", "10", "2000", { ts: "2025-02-01" }),
      ]),
    );
    expect(p.quantity).toBe("20");
    expect(p.costBasis).toBe("3000");
    expect(p.averageCost).toBe("150");
    expect(p.realizedPnL).toBe("0");
  });

  it("realizes P&L on a partial sell and keeps the average cost unchanged", () => {
    const p = only(
      computePositions([
        trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
        trade("BUY", "X", "10", "2000", { ts: "2025-02-01" }),
        trade("SELL", "X", "10", "2500", { ts: "2025-03-01" }),
      ]),
    );
    expect(p.quantity).toBe("10");
    expect(p.costBasis).toBe("1500");
    expect(p.averageCost).toBe("150");
    expect(p.realizedPnL).toBe("1000");
  });

  it("adds buy fees to cost basis and subtracts sell fees from proceeds", () => {
    const buyOnly = only(
      computePositions([trade("BUY", "X", "10", "1000", { fees: "10" })]),
    );
    expect(buyOnly.costBasis).toBe("1010");
    expect(buyOnly.averageCost).toBe("101");

    const withSell = only(
      computePositions([
        trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
        trade("SELL", "X", "5", "600", { fees: "5", ts: "2025-02-01" }),
      ]),
    );
    expect(withSell.realizedPnL).toBe("95");
    expect(withSell.quantity).toBe("5");
    expect(withSell.costBasis).toBe("500");
  });

  it("closes a position fully with no cost-basis dust", () => {
    const p = only(
      computePositions([
        trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
        trade("SELL", "X", "10", "1200", { ts: "2025-02-01" }),
      ]),
    );
    expect(p.quantity).toBe("0");
    expect(p.costBasis).toBe("0");
    expect(p.averageCost).toBe("0");
    expect(p.realizedPnL).toBe("200");
  });

  it("processes events in chronological order regardless of input order", () => {
    const p = only(
      computePositions([
        trade("SELL", "X", "10", "2500", { ts: "2025-03-01" }),
        trade("BUY", "X", "10", "2000", { ts: "2025-02-01" }),
        trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
      ]),
    );
    expect(p.averageCost).toBe("150");
    expect(p.realizedPnL).toBe("1000");
  });

  it("keeps the same instrument separate across sleeves (ring-fence)", () => {
    const positions = computePositions([
      trade("BUY", "X", "10", "1000", { sleeve: "CORE" }),
      trade("BUY", "X", "5", "1000", { sleeve: "TRADING" }),
    ]);
    expect(positions).toHaveLength(2);
    const core = positions.find((p) => p.sleeve === "CORE")!;
    const trading = positions.find((p) => p.sleeve === "TRADING")!;
    expect(core.quantity).toBe("10");
    expect(core.averageCost).toBe("100");
    expect(trading.quantity).toBe("5");
    expect(trading.averageCost).toBe("200");
  });

  it("groups multiple instruments independently", () => {
    const positions = computePositions([
      trade("BUY", "X", "10", "1000"),
      trade("BUY", "Y", "2", "500"),
    ]);
    expect(positions).toHaveLength(2);
    expect(positions.find((p) => p.instrumentId === "Y")!.averageCost).toBe(
      "250",
    );
  });

  it("converts amounts to base currency via fxToBase", () => {
    const p = only(
      computePositions([trade("BUY", "X", "10", "1000", { fxToBase: "0.9" })]),
    );
    expect(p.costBasis).toBe("900");
  });

  it("ignores dividends and cash movements", () => {
    const events: LedgerEvent[] = [
      trade("BUY", "X", "10", "1000"),
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
    ];
    const p = only(computePositions(events));
    expect(p.quantity).toBe("10");
    expect(p.costBasis).toBe("1000");
  });
});
