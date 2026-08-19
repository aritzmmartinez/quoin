import {
  deflate,
  periodOf,
  type InflationIndex,
  type LedgerEvent,
  type Period,
  type Revalue,
} from "../domain";

export type RealBasis =
  | { ok: true; reference: Period; revalue: Revalue }
  | { ok: false; reference: Period | null; missing: Period[] };

function isTrade(event: LedgerEvent): boolean {
  return event.type === "BUY" || event.type === "SELL";
}

/**
 * Build the deflator for a set of events, or report why it cannot be built.
 *
 * The reference month is the last one the statistics office has published, not
 * the current month: the current month's index does not exist yet, and inventing
 * it is the one thing this feature must never do.
 *
 */
export function realBasis(
  index: InflationIndex,
  events: readonly LedgerEvent[],
): RealBasis {
  const periods = [
    ...new Set(events.filter(isTrade).map((event) => periodOf(event.ts))),
  ].sort();

  const reference = index.latestPeriod();
  if (reference === null)
    return { ok: false, reference: null, missing: periods };

  const missing = periods.filter((p) => p <= reference && !index.has(p));
  if (missing.length > 0) return { ok: false, reference, missing };

  return {
    ok: true,
    reference,
    revalue: (money, ts) => {
      const from = periodOf(ts);
      if (from > reference) return money;
      const restated = deflate(index, money, from, reference);
      if (restated === null) {
        throw new Error(
          `Inflation series "${index.series}" has no level for ${from}`,
        );
      }
      return restated;
    },
  };
}
