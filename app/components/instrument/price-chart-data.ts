import Decimal from "decimal.js";

import type { CostBasisPoint } from "~/core/projections";

export interface PricePoint {
  t: number;
  price: number;
}

export interface PriceChartPoint {
  t: number;
  price: number | null;
  avgCost: number | null;
  buy: number | null;
  sell: number | null;
}

export function buildPriceChartData(
  timeline: readonly CostBasisPoint[],
  prices: readonly PricePoint[],
): PriceChartPoint[] {
  const points = [
    ...timeline.map((pt) => ({
      t: new Date(pt.ts).getTime(),
      price: null,
      avgCost: new Decimal(pt.quantityAfter).isZero()
        ? null
        : Number(pt.avgCostAfter),
      buy: pt.side === "BUY" ? Number(pt.tradePrice) : null,
      sell: pt.side === "SELL" ? Number(pt.tradePrice) : null,
    })),
    ...prices.map((p) => ({
      t: p.t,
      price: p.price,
      avgCost: null,
      buy: null,
      sell: null,
    })),
  ].sort((a, b) => a.t - b.t);

  let avgCost: number | null = null;
  return points.map((p) => {
    if (p.buy !== null || p.sell !== null) avgCost = p.avgCost;
    return { ...p, avgCost };
  });
}
