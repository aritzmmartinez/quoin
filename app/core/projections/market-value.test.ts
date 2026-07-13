import { describe, expect, it } from "vitest";

import type { Position } from "./positions";
import { computeMarketValues, type PriceLike } from "./market-value";
import { tradeMetaKey } from "./trade-meta";

function position(overrides: Partial<Position> & Pick<Position, "instrumentId">): Position {
  return {
    sleeve: "CORE",
    quantity: "10",
    costBasis: "1000",
    averageCost: "100",
    realizedPnL: "0",
    ...overrides,
  };
}

const key = (id: string) => tradeMetaKey(id, "CORE");

describe("computeMarketValues", () => {
  it("computes value and unrealized P&L from price × quantity", () => {
    const prices = new Map<string, PriceLike>([["A", { price: "120", currency: "EUR" }]]);
    const result = computeMarketValues([position({ instrumentId: "A" })], prices, "EUR");

    expect(result.get(key("A"))?.marketValue).toBe("1200");
    expect(result.get(key("A"))?.unrealizedPnL).toBe("200"); // 1200 − 1000
  });

  it("leaves a position unpriced when there is no snapshot", () => {
    const result = computeMarketValues(
      [position({ instrumentId: "A" })],
      new Map<string, PriceLike>(),
      "EUR",
    );
    expect(result.get(key("A"))).toEqual({
      marketValue: null,
      unrealizedPnL: null,
      weight: null,
    });
  });

  it("ignores a snapshot that is not in the base currency (no FX here)", () => {
    const prices = new Map<string, PriceLike>([["A", { price: "120", currency: "USD" }]]);
    const result = computeMarketValues([position({ instrumentId: "A" })], prices, "EUR");
    expect(result.get(key("A"))?.marketValue).toBeNull();
  });

  it("weights each priced holding as its share of the total, summing to 1", () => {
    const prices = new Map<string, PriceLike>([
      ["A", { price: "100", currency: "EUR" }], // 10 × 100 = 1000
      ["B", { price: "300", currency: "EUR" }], // 10 × 300 = 3000
    ]);
    const result = computeMarketValues(
      [position({ instrumentId: "A" }), position({ instrumentId: "B" })],
      prices,
      "EUR",
    );

    expect(result.get(key("A"))?.weight).toBe("0.250000");
    expect(result.get(key("B"))?.weight).toBe("0.750000");
  });

  it("gives no weight when nothing is priced", () => {
    const result = computeMarketValues(
      [position({ instrumentId: "A" })],
      new Map<string, PriceLike>(),
      "EUR",
    );
    expect(result.get(key("A"))?.weight).toBeNull();
  });
});
