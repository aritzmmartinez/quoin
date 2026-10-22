import type { MappedBatch } from "~/adapters/ingestion";

import type { EnsureRates } from "./fx-sync";

export async function planWithRates(
  plan: () => Promise<MappedBatch>,
  rates: EnsureRates,
): Promise<MappedBatch> {
  const first = await plan();
  if (first.ratesNeeded.size === 0) return first;
  await rates(first.ratesNeeded);
  return plan();
}
