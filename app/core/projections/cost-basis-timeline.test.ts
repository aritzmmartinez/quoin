import { describe, expect, it } from "vitest";

import type { LedgerEvent, TradeEvent } from "../domain";
import { computeCostBasisTimeline } from "./cost-basis-timeline";

function trade(
  overrides: Partial<TradeEvent> &
    Pick<TradeEvent, "ts" | "grossAmount" | "quantity">,
): TradeEvent {
  return {
    id: crypto.randomUUID(),
    type: "BUY",
    instrumentId: "VWCE",
    sleeve: "CORE",
    currency: "EUR",
    fxToBase: "1",
    account: "trade-republic",
    source: "trade-republic",
    price: "0",
    fees: "0",
    ...overrides,
  };
}

describe("computeCostBasisTimeline", () => {
  it("emits one running-AVCO point per trade, chronologically", () => {
    const events: LedgerEvent[] = [
      trade({ ts: new Date("2026-03-01"), quantity: "5", grossAmount: "1100" }),
      trade({
        ts: new Date("2026-01-01"),
        quantity: "10",
        grossAmount: "1000",
      }),
    ];
    const points = computeCostBasisTimeline(events, "VWCE");

    expect(points).toHaveLength(2);
    expect(points[0]?.ts).toBe(new Date("2026-01-01").toISOString());
    expect(points[0]?.avgCostAfter).toBe("100");
    expect(points[0]?.quantityAfter).toBe("10");
    expect(points[1]?.tradePrice).toBe("220");
    expect(points[1]?.avgCostAfter).toBe("140");
    expect(points[1]?.investedAfter).toBe("2100");
  });

  it("keeps average cost flat on a partial sell (AVCO)", () => {
    const events: LedgerEvent[] = [
      trade({
        ts: new Date("2026-01-01"),
        quantity: "10",
        grossAmount: "1000",
      }),
      trade({
        ts: new Date("2026-02-01"),
        type: "SELL",
        quantity: "4",
        grossAmount: "600",
      }),
    ];
    const points = computeCostBasisTimeline(events, "VWCE");

    expect(points[1]?.side).toBe("SELL");
    expect(points[1]?.quantityAfter).toBe("6");
    expect(points[1]?.avgCostAfter).toBe("100");
    expect(points[1]?.investedAfter).toBe("600");
  });

  it("ignores other instruments and non-trade events", () => {
    const events: LedgerEvent[] = [
      trade({
        ts: new Date("2026-01-01"),
        quantity: "10",
        grossAmount: "1000",
        instrumentId: "OTHER",
      }),
      {
        id: crypto.randomUUID(),
        type: "DEPOSIT",
        currency: "EUR",
        fxToBase: "1",
        account: "trade-republic",
        source: "trade-republic",
        ts: new Date("2026-01-02"),
        grossAmount: "500",
      },
    ];
    expect(computeCostBasisTimeline(events, "VWCE")).toHaveLength(0);
  });
});
