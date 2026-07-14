import { describe, expect, it } from "vitest";

import type { LedgerEvent, TradeEvent } from "../domain";
import { computeInvestedVsValueSeries } from "./invested-vs-value";

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
    account: "tr",
    source: "tr",
    price: "0",
    fees: "0",
    ...o,
  };
}

const now = new Date("2026-06-01");

describe("computeInvestedVsValueSeries", () => {
  it("marks invested (exact) and value at each trade and at now", () => {
    const events: LedgerEvent[] = [
      trade({
        ts: new Date("2026-01-01"),
        quantity: "10",
        grossAmount: "1000",
      }),
    ];
    const s = computeInvestedVsValueSeries(events, "VWCE", [], "120", now);
    expect(s).toEqual([
      { t: new Date("2026-01-01").getTime(), invested: "1000", value: "1000" },
      { t: now.getTime(), invested: "1000", value: "1200" },
    ]);
  });

  it("inserts value points from price snapshots between trades", () => {
    const events: LedgerEvent[] = [
      trade({
        ts: new Date("2026-01-01"),
        quantity: "10",
        grossAmount: "1000",
      }),
    ];
    const history = [{ asOf: new Date("2026-03-01"), price: "110" }];
    const s = computeInvestedVsValueSeries(events, "VWCE", history, "120", now);
    expect(s.map((p) => p.value)).toEqual(["1000", "1100", "1200"]);
    expect(s.every((p) => p.invested === "1000")).toBe(true);
  });

  it("is empty when the instrument has no trades", () => {
    expect(computeInvestedVsValueSeries([], "VWCE", [], "120", now)).toEqual(
      [],
    );
  });
});
