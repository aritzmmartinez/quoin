import type { Instrument, LedgerEvent } from "~/core/domain";
import {
  ledgerDedupKey,
  type InstrumentRepository,
  type LedgerRepository,
} from "~/core/ports";

import type { DiscardDetail, DiscardReason } from "./discard";

export type { DiscardDetail, DiscardReason } from "./discard";

export type DiscardCounts = Partial<Record<DiscardReason, number>>;
export type DiscardDetails = Partial<Record<DiscardReason, DiscardDetail[]>>;

export type MappedItem =
  | { kind: "domain"; instrument: Instrument | null; event: LedgerEvent }
  | {
      kind: "discard";
      reason: DiscardReason;
      detail?: DiscardDetail;
      instrument?: Instrument;
    };

export interface MappedBatch {
  total: number;
  instruments: Instrument[];
  events: LedgerEvent[];
  discarded: DiscardCounts;
  discardedDetails: DiscardDetails;
  errors: number;
}

export interface ImportSummary {
  total: number;
  imported: number;
  duplicates: number;
  discarded: DiscardCounts;
  discardedDetails: DiscardDetails;
  errors: number;
  instruments: number;
}

export class BatchBuilder {
  private readonly events: LedgerEvent[] = [];
  private readonly instruments = new Map<string, Instrument>();
  private readonly discarded: DiscardCounts = {};
  private readonly discardedDetails: DiscardDetails = {};
  private errors = 0;

  add(item: MappedItem): void {
    if (item.kind === "discard") {
      this.discarded[item.reason] = (this.discarded[item.reason] ?? 0) + 1;
      if (item.detail) {
        const list = this.discardedDetails[item.reason] ?? [];
        list.push(item.detail);
        this.discardedDetails[item.reason] = list;
      }
      if (item.instrument) {
        this.instruments.set(item.instrument.id, item.instrument);
      }
      return;
    }
    if (item.instrument) {
      this.instruments.set(item.instrument.id, item.instrument);
    }
    this.events.push(item.event);
  }

  addError(): void {
    this.errors += 1;
  }

  build(total: number): MappedBatch {
    return {
      total,
      instruments: [...this.instruments.values()],
      events: this.events,
      discarded: this.discarded,
      discardedDetails: this.discardedDetails,
      errors: this.errors,
    };
  }
}

export async function persistBatch(
  instruments: InstrumentRepository,
  ledger: LedgerRepository,
  batch: MappedBatch,
): Promise<ImportSummary> {
  await instruments.upsert(batch.instruments);
  const { inserted, skipped } = await ledger.append(batch.events);
  return {
    total: batch.total,
    imported: inserted,
    duplicates: skipped,
    discarded: batch.discarded,
    discardedDetails: batch.discardedDetails,
    errors: batch.errors,
    instruments: batch.instruments.length,
  };
}

export async function previewBatch(
  ledger: LedgerRepository,
  batch: MappedBatch,
): Promise<ImportSummary> {
  const existing = await ledger.existing(batch.events);
  let duplicates = 0;
  for (const event of batch.events) {
    if (
      event.externalId &&
      existing.has(ledgerDedupKey(event.source, event.externalId))
    ) {
      duplicates += 1;
    }
  }
  return {
    total: batch.total,
    imported: batch.events.length - duplicates,
    duplicates,
    discarded: batch.discarded,
    discardedDetails: batch.discardedDetails,
    errors: batch.errors,
    instruments: batch.instruments.length,
  };
}
