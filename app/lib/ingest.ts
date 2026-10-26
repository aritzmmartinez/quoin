import type {
  Broker,
  DiscardDetail,
  ImportSummary,
} from "~/adapters/ingestion";
import type { Instrument } from "~/core/domain";

import type { Copy } from "./i18n";

import type { BackfillReport } from "./prices-backfill";

export interface PendingMapping {
  instrumentId: string;
  name: string;
  quantity: string;
  suggested: string | null;
  cryptoCode: string | null;
}

/**
 * Yahoo quotes a crypto asset as `<CODE>-EUR`, except where the code is shared
 * and Yahoo appends its own number, or no euro line exists. Each exception is
 * checked by hand before it goes in; the symbol check still decides.
 *
 * - PEPE: `PEPE24478-EUR` answers 404 and `PEPE24478-USD` has daily history
 *   (measured 2026-10-22); the dollar line is valued at the ECB rate.
 */
const CRYPTO_SYMBOLS: Readonly<Record<string, string>> = {
  PEPE: "PEPE24478-USD",
};

export function cryptoCodeOf(instrument: Instrument): string | null {
  return instrument.type === "CRYPTO" ? instrument.id : null;
}

export function noQuoteMessage(
  t: Copy,
  cryptoCode: string | null,
  symbol: string,
): string {
  return cryptoCode === null
    ? t.ingest.map.noQuote(symbol)
    : t.ingest.map.noQuoteCrypto(symbol, cryptoCode);
}

export function noDailyHistoryMessage(
  t: Copy,
  cryptoCode: string | null,
): string {
  return cryptoCode === null
    ? t.ingest.map.noDailyHistory
    : t.ingest.map.noDailyHistoryCrypto(cryptoCode);
}

export function suggestedQuoteSymbol(instrument: Instrument): string | null {
  if (instrument.type !== "CRYPTO") return null;
  return CRYPTO_SYMBOLS[instrument.id] ?? `${instrument.id}-EUR`;
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
  noRateSeries: number;
  unavailable: string[];
  ratesUnavailable: string[];
}

const UNPRICED_REASONS = ["reward-unpriced", "swap-unpriced"] as const;

function unpricedDetails(summary: ImportSummary): DiscardDetail[] {
  return UNPRICED_REASONS.flatMap(
    (reason) => summary.discardedDetails[reason] ?? [],
  );
}

export function unpricedEntries(summary: ImportSummary): number {
  return UNPRICED_REASONS.reduce(
    (count, reason) => count + (summary.discarded[reason] ?? 0),
    0,
  );
}

export function unpricedAssetIds(summary: ImportSummary): string[] {
  const ids = unpricedDetails(summary).flatMap(
    (detail) =>
      detail.unpriced ?? (detail.instrument ? [detail.instrument] : []),
  );
  return [...new Set(ids)];
}

export function earliestUnpriced(summary: ImportSummary): Date | null {
  const dates = unpricedDetails(summary).map((detail) =>
    new Date(detail.date).getTime(),
  );
  return dates.length === 0 ? null : new Date(Math.min(...dates));
}

export interface MergedRetry {
  summary: ImportSummary;
  recovered: number;
}

export function mergeRetry(
  first: ImportSummary,
  retry: ImportSummary,
): MergedRetry {
  const discarded = { ...first.discarded };
  const discardedDetails = { ...first.discardedDetails };
  for (const reason of UNPRICED_REASONS) {
    const left = retry.discarded[reason] ?? 0;
    if (left > 0) {
      discarded[reason] = left;
      discardedDetails[reason] = retry.discardedDetails[reason] ?? [];
    } else {
      delete discarded[reason];
      delete discardedDetails[reason];
    }
  }
  const left = unpricedEntries(retry);
  return {
    summary: {
      ...first,
      imported: first.imported + retry.imported,
      discarded,
      discardedDetails,
    },
    recovered: unpricedEntries(first) - left,
  };
}

export function retryAfterFill(
  summary: ImportSummary,
  fill: PriceFillResult | null,
): boolean {
  if (fill === null || unpricedEntries(summary) === 0) return false;
  const ids = new Set(unpricedAssetIds(summary));
  return fill.backfilled.some(
    (report) => ids.has(report.instrumentId) && report.written > 0,
  );
}

export function unpricedNeedMapping(
  summary: ImportSummary,
  pending: readonly PendingMapping[],
  mapped: Readonly<Record<string, string>>,
): boolean {
  if (unpricedEntries(summary) === 0) return false;
  const waiting = new Set(
    pending.map((p) => p.instrumentId).filter((id) => !(id in mapped)),
  );
  return unpricedAssetIds(summary).some((id) => waiting.has(id));
}

export type ImportAction = "import" | "value-unpriced" | "nothing";

export function importAction(summary: ImportSummary): ImportAction {
  if (summary.imported > 0) return "import";
  if (unpricedEntries(summary) > 0) return "value-unpriced";
  return "nothing";
}
