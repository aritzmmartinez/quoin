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
}

export interface PriceFillResult {
  backfilled: BackfillReport[];
  candles: number;
  synced: number;
  stale: number;
  noQuote: number;
}
