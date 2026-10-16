import { describe, expect, it } from "vitest";

import type { CostBasisPoint } from "~/core/projections";

import { buildPriceChartData, type PricePoint } from "./price-chart-data";

const DAY = 86_400_000;

const trade = (
  day: number,
  side: "BUY" | "SELL",
  quantityAfter: string,
  avgCostAfter: string,
): CostBasisPoint => ({
  ts: new Date(day * DAY).toISOString(),
  side,
  tradePrice: "100",
  tradeQuantity: "1",
  quantityAfter,
  avgCostAfter,
  investedAfter: "0",
});

const prices = (...days: number[]): PricePoint[] =>
  days.map((day) => ({ t: day * DAY, price: 100 }));

const avgCostByDay = (
  timeline: CostBasisPoint[],
  priceDays: PricePoint[],
): [number, number | null][] =>
  buildPriceChartData(timeline, priceDays).map((p) => [p.t / DAY, p.avgCost]);

describe("buildPriceChartData", () => {
  it("has no average cost before the first buy or after a closing sale", () => {
    const out = avgCostByDay(
      [trade(2, "BUY", "2", "90"), trade(4, "SELL", "0", "0")],
      prices(1, 3, 5, 6),
    );
    expect(out).toEqual([
      [1, null],
      [2, 90],
      [3, 90],
      [4, null],
      [5, null],
      [6, null],
    ]);
  });

  it("leaves a gap while closed and resumes at the next buy", () => {
    const out = avgCostByDay(
      [
        trade(1, "BUY", "1", "80"),
        trade(3, "SELL", "0", "0"),
        trade(5, "BUY", "1", "120"),
      ],
      prices(2, 4, 6),
    );
    expect(out).toEqual([
      [1, 80],
      [2, 80],
      [3, null],
      [4, null],
      [5, 120],
      [6, 120],
    ]);
  });

  it("keeps the line through a partial sale", () => {
    const out = avgCostByDay(
      [trade(1, "BUY", "3", "100"), trade(3, "SELL", "1", "100")],
      prices(2, 4),
    );
    expect(out).toEqual([
      [1, 100],
      [2, 100],
      [3, 100],
      [4, 100],
    ]);
  });

  it("reads holdings from the quantity, not from a zero average cost", () => {
    const out = avgCostByDay(
      [trade(1, "BUY", "1", "0"), trade(2, "SELL", "0", "0")],
      prices(3),
    );
    expect(out).toEqual([
      [1, 0],
      [2, null],
      [3, null],
    ]);
  });

  it("marks buys and sells at their trade price and leaves prices bare", () => {
    const [buy, price] = buildPriceChartData(
      [trade(1, "BUY", "1", "100")],
      prices(2),
    );
    expect(buy).toMatchObject({ price: null, buy: 100, sell: null });
    expect(price).toMatchObject({ price: 100, buy: null, sell: null });
  });
});
