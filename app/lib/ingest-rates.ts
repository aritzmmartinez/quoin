import type { MappedBatch } from "~/adapters/ingestion";

import type { EnsureRates, RateConflict } from "./fx-sync";

export interface PlannedBatch {
  batch: MappedBatch;
  rateConflicts: RateConflict[];
}

export async function planWithRates(
  plan: () => Promise<MappedBatch>,
  rates: EnsureRates,
): Promise<PlannedBatch> {
  const first = await plan();
  if (first.ratesNeeded.size === 0) return { batch: first, rateConflicts: [] };
  const { conflicts = [] } = await rates(first.ratesNeeded);
  return { batch: await plan(), rateConflicts: conflicts };
}
