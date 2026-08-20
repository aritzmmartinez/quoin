import Decimal from "decimal.js";

import {
  Money,
  type LedgerEvent,
  type Revalue,
  type TradeEvent,
} from "../domain";

export interface CostBasisPoint {
  ts: string;
  side: "BUY" | "SELL";
  tradePrice: string;
  tradeQuantity: string;
  quantityAfter: string;
  avgCostAfter: string;
  investedAfter: string;
}

function isTrade(event: LedgerEvent): event is TradeEvent {
  return event.type === "BUY" || event.type === "SELL";
}

/**
 * Build the running weighted-average-cost (AVCO) history for a single instrument,
 * one point per trade in chronological order. Mirrors `computePositions` exactly,
 * so the last point matches that instrument's current position.
 *
 * Sleeves are aggregated here (the detail view is per instrument); for holdings
 * that only use CORE this is identical to the per-sleeve position. Pure.
 */
export function computeCostBasisTimeline(
  events: readonly LedgerEvent[],
  instrumentId: string,
  revalue?: Revalue,
): CostBasisPoint[] {
  const restate: Revalue = revalue ?? ((money) => money);

  const trades = events
    .filter(isTrade)
    .filter((t) => t.instrumentId === instrumentId)
    .slice()
    .sort((a, b) => a.ts.getTime() - b.ts.getTime());

  let quantity = new Decimal(0);
  let costBasis = Money.zero();
  const points: CostBasisPoint[] = [];

  for (const trade of trades) {
    const tradeQty = new Decimal(trade.quantity);
    const gross = restate(
      Money.fromString(trade.grossAmount).scaleBy(trade.fxToBase),
      trade.ts,
    );
    const fees = restate(
      Money.fromString(trade.fees).scaleBy(trade.fxToBase),
      trade.ts,
    );
    const tradePrice = tradeQty.isZero()
      ? Money.zero()
      : gross.divideBy(tradeQty);

    if (trade.type === "BUY") {
      costBasis = costBasis.add(gross).add(fees);
      quantity = quantity.plus(tradeQty);
    } else {
      const averageCost = quantity.isZero()
        ? Money.zero()
        : costBasis.divideBy(quantity);
      costBasis = costBasis.subtract(averageCost.scaleBy(tradeQty));
      quantity = quantity.minus(tradeQty);
      if (quantity.isZero()) costBasis = Money.zero();
    }

    const avgCost = quantity.isZero()
      ? Money.zero()
      : costBasis.divideBy(quantity);

    points.push({
      ts: trade.ts.toISOString(),
      side: trade.type,
      tradePrice: tradePrice.toString(),
      tradeQuantity: tradeQty.toFixed(),
      quantityAfter: quantity.toFixed(),
      avgCostAfter: avgCost.toString(),
      investedAfter: costBasis.toString(),
    });
  }

  return points;
}
