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

export const IPC_SYNC_MAX_AGE_DAYS = 35;

const DAY_MS = 24 * 60 * 60 * 1000;

export function ipcSyncStale(lastCheckedAt: Date | null, now: Date): boolean {
  if (lastCheckedAt === null) return true;
  return (
    now.getTime() - lastCheckedAt.getTime() > IPC_SYNC_MAX_AGE_DAYS * DAY_MS
  );
}
