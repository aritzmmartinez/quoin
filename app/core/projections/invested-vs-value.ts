import Decimal from "decimal.js";

import type { LedgerEvent } from "../domain";
import { computeCostBasisTimeline } from "./cost-basis-timeline";

export interface InvestedVsValuePoint {
  t: number;
  invested: string;
  value: string;
}

interface PricePoint {
  asOf: Date;
  price: string;
}

export function computeInvestedVsValueSeries(
  events: readonly LedgerEvent[],
  instrumentId: string,
  priceHistory: readonly PricePoint[],
  currentPrice: string | null,
  now: Date = new Date(),
): InvestedVsValuePoint[] {
  const timeline = computeCostBasisTimeline(events, instrumentId);
  if (timeline.length === 0) return [];

  type Mark =
    | {
        t: number;
        kind: "trade";
        quantity: string;
        invested: string;
        price: string;
      }
    | { t: number; kind: "price"; price: string };

  const marks: Mark[] = timeline.map((pt) => ({
    t: new Date(pt.ts).getTime(),
    kind: "trade",
    quantity: pt.quantityAfter,
    invested: pt.investedAfter,
    price: pt.tradePrice,
  }));

  const firstTradeT = marks[0]!.t;
  for (const s of priceHistory) {
    const t = s.asOf.getTime();
    if (t >= firstTradeT) marks.push({ t, kind: "price", price: s.price });
  }
  if (currentPrice !== null) {
    marks.push({ t: now.getTime(), kind: "price", price: currentPrice });
  }

  marks.sort((a, b) => a.t - b.t);

  let quantity = new Decimal(0);
  let invested = "0";
  const series: InvestedVsValuePoint[] = [];

  for (const mark of marks) {
    if (mark.kind === "trade") {
      quantity = new Decimal(mark.quantity);
      invested = mark.invested;
    }
    series.push({
      t: mark.t,
      invested,
      value: quantity.mul(mark.price).toString(),
    });
  }

  return series;
}
