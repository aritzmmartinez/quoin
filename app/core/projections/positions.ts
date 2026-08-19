import { Money, type LedgerEvent, type Revalue, type Sleeve } from "../domain";

import { walkAvco } from "./avco";

export interface Position {
  instrumentId: string;
  sleeve: Sleeve;
  quantity: string;
  costBasis: string;
  averageCost: string;
  realizedPnL: string;
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
 * The AVCO arithmetic lives in `walkAvco`, shared with `computeRealizedGains` so the
 * portfolio total and the per-sale breakdown cannot drift apart.
 *
 * FIFO tax lots are a separate projection (required by tax rules) and intentionally
 * not computed here.
 *
 * With a `revalue`, the cost basis comes back in real terms: each purchase is
 * deflated at its own date inside the walk, never the finished total.
 */
export function computePositions(
  events: readonly LedgerEvent[],
  revalue?: Revalue,
): Position[] {
  return [...walkAvco(events, revalue).lots.values()].map((lot) => {
    const averageCost = lot.quantity.isZero()
      ? Money.zero()
      : lot.costBasis.divideBy(lot.quantity);
    return {
      instrumentId: lot.instrumentId,
      sleeve: lot.sleeve,
      quantity: lot.quantity.toFixed(),
      costBasis: lot.costBasis.toString(),
      averageCost: averageCost.toString(),
      realizedPnL: lot.realizedPnL.toString(),
    };
  });
}
