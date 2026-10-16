import type { Broker, ImportSummary } from "~/adapters/ingestion";

import type { BackfillReport } from "./prices-backfill";

export interface PendingMapping {
  instrumentId: string;
  name: string;
  quantity: string;
}

export interface IngestPreview {
  broker: Broker;
  summary: ImportSummary;
}

export interface IngestResult extends IngestPreview {
  pending: PendingMapping[];
  retryIds: string[];
}

export interface PriceFillResult {
  backfilled: BackfillReport[];
  candles: number;
  synced: number;
  stale: number;
  noQuote: number;
  notEur: number;
}

export function unpricedRewards(summary: ImportSummary): number {
  return summary.discarded["reward-unpriced"] ?? 0;
}

export function rewardRetryIds(summary: ImportSummary): string[] {
  const ids = (summary.discardedDetails["reward-unpriced"] ?? []).flatMap(
    (detail) => (detail.instrument ? [detail.instrument] : []),
  );
  return [...new Set(ids)];
}

export function earliestUnpricedReward(summary: ImportSummary): Date | null {
  const dates = (summary.discardedDetails["reward-unpriced"] ?? []).map(
    (detail) => new Date(detail.date).getTime(),
  );
  return dates.length === 0 ? null : new Date(Math.min(...dates));
}

export interface RewardRetry {
  summary: ImportSummary;
  recovered: number;
}

export function mergeRewardRetry(
  first: ImportSummary,
  retry: ImportSummary,
): RewardRetry {
  const discarded = { ...first.discarded };
  const discardedDetails = { ...first.discardedDetails };
  const left = unpricedRewards(retry);
  if (left > 0) {
    discarded["reward-unpriced"] = left;
    discardedDetails["reward-unpriced"] =
      retry.discardedDetails["reward-unpriced"] ?? [];
  } else {
    delete discarded["reward-unpriced"];
    delete discardedDetails["reward-unpriced"];
  }
  return {
    summary: {
      ...first,
      imported: first.imported + retry.imported,
      discarded,
      discardedDetails,
    },
    recovered: unpricedRewards(first) - left,
  };
}

export function retryAfterFill(
  summary: ImportSummary,
  fill: PriceFillResult | null,
): boolean {
  if (fill === null || unpricedRewards(summary) === 0) return false;
  const ids = new Set(rewardRetryIds(summary));
  return fill.backfilled.some(
    (report) => ids.has(report.instrumentId) && report.written > 0,
  );
}

export function rewardsNeedMapping(
  summary: ImportSummary,
  pending: readonly PendingMapping[],
  mapped: Readonly<Record<string, string>>,
): boolean {
  if (unpricedRewards(summary) === 0) return false;
  const waiting = new Set(
    pending.map((p) => p.instrumentId).filter((id) => !(id in mapped)),
  );
  return rewardRetryIds(summary).some((id) => waiting.has(id));
}

export type ImportAction = "import" | "value-rewards" | "nothing";

export function importAction(summary: ImportSummary): ImportAction {
  if (summary.imported > 0) return "import";
  if (unpricedRewards(summary) > 0) return "value-rewards";
  return "nothing";
}
