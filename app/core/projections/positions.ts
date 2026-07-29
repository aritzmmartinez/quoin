import Decimal from "decimal.js";
import {
  Money,
  type LedgerEvent,
  type Sleeve,
  type TradeEvent,
} from "../domain";

export interface Position {
  instrumentId: string;
  sleeve: Sleeve;
  quantity: string;
  costBasis: string;
  averageCost: string;
  realizedPnL: string;
}

interface Accumulator {
  instrumentId: string;
  sleeve: Sleeve;
  quantity: Decimal;
  costBasis: Money;
  realizedPnL: Money;
}

function isTrade(event: LedgerEvent): event is TradeEvent {
  return event.type === "BUY" || event.type === "SELL";
}

function keyOf(instrumentId: string, sleeve: Sleeve): string {
  return `${instrumentId}::${sleeve}`;
}

/**
 * Derive current positions from the ledger using weighted-average cost (AVCO).
 *
 * Pure function: same events in, same positions out. Trades are processed in
 * chronological order regardless of input order. Amounts are aggregated in the base
 * currency (each is multiplied by its `fxToBase`, which is "1" for base-currency events).
 *
 * Only BUY/SELL affect positions; dividends and cash movements are ignored here
 * (they belong to separate projections). Positions are keyed by instrument + sleeve
 * so the CORE and TRADING sleeves stay ring-fenced.
 *
 * FIFO tax lots are a separate projection (required by tax rules) and intentionally
 * not computed here.
 */
export function computePositions(events: readonly LedgerEvent[]): Position[] {
  const trades = events
    .filter(isTrade)
    .slice()
    .sort((a, b) => a.ts.getTime() - b.ts.getTime());

  const accumulators = new Map<string, Accumulator>();

  for (const trade of trades) {
    const key = keyOf(trade.instrumentId, trade.sleeve);
    let acc = accumulators.get(key);
    if (!acc) {
      acc = {
        instrumentId: trade.instrumentId,
        sleeve: trade.sleeve,
        quantity: new Decimal(0),
        costBasis: Money.zero(),
        realizedPnL: Money.zero(),
      };
      accumulators.set(key, acc);
    }

    const quantity = new Decimal(trade.quantity);
    const gross = Money.fromString(trade.grossAmount).scaleBy(trade.fxToBase);
    const fees = Money.fromString(trade.fees).scaleBy(trade.fxToBase);

    if (trade.type === "BUY") {
      acc.costBasis = acc.costBasis.add(gross).add(fees);
      acc.quantity = acc.quantity.plus(quantity);
    } else {
      const averageCost = acc.quantity.isZero()
        ? Money.zero()
        : acc.costBasis.divideBy(acc.quantity);
      const costRemoved = averageCost.scaleBy(quantity);
      const proceeds = gross.subtract(fees);

      acc.realizedPnL = acc.realizedPnL.add(proceeds).subtract(costRemoved);
      acc.costBasis = acc.costBasis.subtract(costRemoved);
      acc.quantity = acc.quantity.minus(quantity);

      if (acc.quantity.isZero()) {
        acc.costBasis = Money.zero();
      }
    }
  }

  return [...accumulators.values()].map((acc) => {
    const averageCost = acc.quantity.isZero()
      ? Money.zero()
      : acc.costBasis.divideBy(acc.quantity);
    return {
      instrumentId: acc.instrumentId,
      sleeve: acc.sleeve,
      quantity: acc.quantity.toFixed(),
      costBasis: acc.costBasis.toString(),
      averageCost: averageCost.toString(),
      realizedPnL: acc.realizedPnL.toString(),
    };
  });
}
