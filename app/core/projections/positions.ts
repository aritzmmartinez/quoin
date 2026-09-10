import { Money, type LedgerEvent, type Revalue } from "../domain";

import { walkAvco } from "./avco";

export interface Position {
  instrumentId: string;
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
 * (they belong to separate projections). One instrument is one position: the
 * (instrument, sleeve) partition is gone, and with it the two AVCO lots the same
 * instrument used to be split into.
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
      quantity: lot.quantity.toFixed(),
      costBasis: lot.costBasis.toString(),
      averageCost: averageCost.toString(),
      realizedPnL: lot.realizedPnL.toString(),
    };
  });
}
