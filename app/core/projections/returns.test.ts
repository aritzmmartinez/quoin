import { describe, expect, it } from "vitest";

import type { LedgerEvent, TradeEvent } from "../domain";
import { computeReturns } from "./returns";

function trade(
  o: Partial<TradeEvent> & Pick<TradeEvent, "ts" | "grossAmount" | "quantity">,
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
    ...o,
  };
}

describe("computeReturns", () => {
  it("computes contribution stats from buys", () => {
    const events: LedgerEvent[] = [
      trade({
        ts: new Date("2026-01-01"),
        quantity: "10",
        grossAmount: "1000",
      }),
      trade({ ts: new Date("2026-04-01"), quantity: "5", grossAmount: "600" }),
    ];
    const r = computeReturns(events, "VWCE", "120", new Date("2027-01-01"));
    expect(r.totalInvested).toBe("1600");
    expect(r.buyCount).toBe(2);
    expect(r.avgBuyAmount).toBe("800");
  });

  it("TWR equals the security price return for a continuously held position", () => {
    const events: LedgerEvent[] = [
      trade({
        ts: new Date("2026-01-01"),
        quantity: "10",
        grossAmount: "1000",
      }),
      trade({
        ts: new Date("2026-06-01"),
        quantity: "10",
        grossAmount: "1300",
      }),
    ];
    const r = computeReturns(events, "VWCE", "150", new Date("2027-01-01"));
    expect(r.twr).toBe("0.500000");
  });

  it("MWR ≈ 10% for a single 1000 buy worth 1100 one year later", () => {
    const events: LedgerEvent[] = [
      trade({
        ts: new Date("2026-01-01"),
        quantity: "10",
        grossAmount: "1000",
      }),
    ];
    const r = computeReturns(events, "VWCE", "110", new Date("2027-01-01"));
    expect(Number(r.mwr)).toBeCloseTo(0.1, 3);
  });

  it("TWR and MWR diverge under DCA (big late money on a flat stretch drags MWR down)", () => {
    const events: LedgerEvent[] = [
      trade({ ts: new Date("2026-01-01"), quantity: "1", grossAmount: "100" }),
      trade({
        ts: new Date("2026-12-01"),
        quantity: "100",
        grossAmount: "20000",
      }),
    ];
    const r = computeReturns(events, "VWCE", "200", new Date("2027-01-01"));
    expect(r.twr).toBe("1.000000");
    expect(Number(r.mwr)).toBeLessThan(0.5);
    expect(Number(r.mwr)).toBeGreaterThan(0);
  });

  it("returns null TWR/MWR when there is no current price", () => {
    const events: LedgerEvent[] = [
      trade({
        ts: new Date("2026-01-01"),
        quantity: "10",
        grossAmount: "1000",
      }),
    ];
    const r = computeReturns(events, "VWCE", null, new Date("2027-01-01"));
    expect(r.twr).toBeNull();
    expect(r.mwr).toBeNull();
    expect(r.totalInvested).toBe("1000");
  });
});
