import { describe, expect, it } from "vitest";

import { sinceFirstTrade } from "./since-first-trade";

const DAY = 86_400_000;

interface Point {
  t: number;
  price: number | null;
  buy: number | null;
  sell: number | null;
}

const price = (day: number, value = 100): Point => ({
  t: day * DAY,
  price: value,
  buy: null,
  sell: null,
});

const trade = (day: number, side: "buy" | "sell", value = 100): Point => ({
  t: day * DAY,
  price: null,
  buy: side === "buy" ? value : null,
  sell: side === "sell" ? value : null,
});

const days = (data: Point[]) => data.map((d) => d.t / DAY);

describe("sinceFirstTrade", () => {
  it("starts an open position at its first buy and runs to today", () => {
    const data = [
      price(1),
      price(2),
      trade(3, "buy"),
      price(3),
      price(4),
      trade(5, "buy"),
      price(6),
    ];
    expect(days(sinceFirstTrade(data))).toEqual([3, 3, 4, 5, 6]);
  });

  it("keeps a closed position's prices after the sale", () => {
    const data = [
      price(1),
      trade(2, "buy"),
      price(3),
      trade(4, "sell"),
      price(5),
      price(6),
    ];
    expect(days(sinceFirstTrade(data))).toEqual([2, 3, 4, 5, 6]);
  });

  it("starts exactly at a single trade", () => {
    const data = [price(1), price(2), trade(3, "buy"), price(4), price(5)];
    const out = sinceFirstTrade(data);
    expect(days(out)).toEqual([3, 4, 5]);
    expect(out[0]?.buy).toBe(100);
  });

  it("returns the series untouched when there is no trade", () => {
    const data = [price(1), price(2)];
    expect(sinceFirstTrade(data)).toEqual(data);
  });
});
