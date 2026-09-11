import { describe, expect, it } from "vitest";

import type { TradeEvent } from "../domain";

import { walkFifo } from "./fifo";

let seq = 0;

function trade(
  type: "BUY" | "SELL",
  instrumentId: string,
  quantity: string,
  grossAmount: string,
  opts: { fees?: string; ts?: string; fxToBase?: string } = {},
): TradeEvent {
  return {
    id: `evt-${seq++}`,
    ts: new Date(opts.ts ?? "2025-01-01"),
    type,
    instrumentId,
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

describe("walkFifo", () => {
  it("reports nothing when nothing has been sold", () => {
    expect(walkFifo([]).sales).toEqual([]);
    expect(walkFifo([trade("BUY", "X", "10", "1000")]).sales).toEqual([]);
  });

  it("empties a lot exactly on a matching sale", () => {
    const walk = walkFifo([
      trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
      trade("SELL", "X", "10", "1200", { ts: "2025-03-01" }),
    ]);

    expect(walk.sales).toHaveLength(1);
    const sale = walk.sales[0]!;
    expect(sale.costRemoved.toString()).toBe("1000");
    expect(sale.realizedPnL.toString()).toBe("200");
    expect(sale.lots).toHaveLength(1);
    expect(sale.lots[0]!.quantity.toFixed()).toBe("10");
    expect(walk.lots.get("X")).toEqual([]);
  });

  it("crosses several lots oldest-first, keeping their own unit costs", () => {
    const walk = walkFifo([
      trade("BUY", "X", "5", "500", { ts: "2025-01-01" }), // unit cost 100
      trade("BUY", "X", "5", "750", { ts: "2025-02-01" }), // unit cost 150
      trade("SELL", "X", "8", "1600", { ts: "2025-03-01" }),
    ]);

    const sale = walk.sales[0]!;
    // 5 @ 100 + 3 @ 150 = 500 + 450 = 950
    expect(sale.costRemoved.toString()).toBe("950");
    expect(sale.realizedPnL.toString()).toBe("650");
    expect(sale.lots).toHaveLength(2);
    expect(sale.lots[0]!.quantity.toFixed()).toBe("5");
    expect(sale.lots[0]!.unitCost.toString()).toBe("100");
    expect(sale.lots[1]!.quantity.toFixed()).toBe("3");
    expect(sale.lots[1]!.unitCost.toString()).toBe("150");

    const remaining = walk.lots.get("X")!;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.quantity.toFixed()).toBe("2");
    expect(remaining[0]!.unitCost.toString()).toBe("150");
  });

  it("treats a sale that exceeds every lot on record as zero-cost for the unmatched remainder", () => {
    const walk = walkFifo([
      trade("BUY", "X", "5", "500", { ts: "2025-01-01" }), // unit cost 100
      trade("SELL", "X", "8", "1000", { ts: "2025-03-01" }),
    ]);

    const sale = walk.sales[0]!;
    expect(sale.lots).toHaveLength(1);
    expect(sale.lots[0]!.quantity.toFixed()).toBe("5");
    expect(sale.costRemoved.toString()).toBe("500");
    expect(sale.realizedPnL.toString()).toBe("500");
    expect(walk.lots.get("X")).toEqual([]);
  });

  it("keeps one FIFO queue per instrument and consumes the oldest lot first", () => {
    const walk = walkFifo([
      trade("BUY", "X", "5", "500", { ts: "2025-01-01" }),
      trade("BUY", "X", "5", "600", { ts: "2025-01-02" }),
      trade("SELL", "X", "5", "700", { ts: "2025-02-01" }),
    ]);

    expect(walk.sales).toHaveLength(1);
    expect(walk.sales[0]!.costRemoved.toString()).toBe("500");

    const remaining = walk.lots.get("X")!;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.unitCost.toString()).toBe("120");
  });

  it("bakes fees into the acquisition cost, same as AVCO", () => {
    const walk = walkFifo([
      trade("BUY", "X", "10", "1000", { fees: "20", ts: "2025-01-01" }),
      trade("SELL", "X", "10", "1200", { ts: "2025-03-01" }),
    ]);

    const sale = walk.sales[0]!;
    expect(sale.costRemoved.toString()).toBe("1020");
    expect(sale.realizedPnL.toString()).toBe("180");
  });
});
