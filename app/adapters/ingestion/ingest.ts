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
  operationOf: number[];
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
  private readonly operationOf: number[] = [];
  private operations = 0;
  private readonly instruments = new Map<string, Instrument>();
  private readonly discarded: DiscardCounts = {};
  private readonly discardedDetails: DiscardDetails = {};
  private errors = 0;

  add(item: MappedItem): void {
    this.addOperation([item]);
  }

  addOperation(items: readonly MappedItem[]): void {
    const operation = this.operations;
    this.operations += 1;
    for (const item of items) this.addItem(item, operation);
  }

  private addItem(item: MappedItem, operation: number): void {
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
    this.operationOf.push(operation);
  }

  addError(): void {
    this.errors += 1;
  }

  build(total: number): MappedBatch {
    return {
      total,
      instruments: [...this.instruments.values()],
      events: this.events,
      operationOf: this.operationOf,
      discarded: this.discarded,
      discardedDetails: this.discardedDetails,
      errors: this.errors,
    };
  }
}

export function countOperations(
  batch: MappedBatch,
  existing: ReadonlySet<string>,
): { imported: number; duplicates: number } {
  const writes = new Map<number, boolean>();
  batch.events.forEach((event, index) => {
    const operation = batch.operationOf[index] ?? index;
    const isNew =
      !event.externalId ||
      !existing.has(ledgerDedupKey(event.source, event.externalId));
    writes.set(operation, (writes.get(operation) ?? false) || isNew);
  });
  let imported = 0;
  for (const writesSomething of writes.values()) {
    if (writesSomething) imported += 1;
  }
  return { imported, duplicates: writes.size - imported };
}

function summarize(
  batch: MappedBatch,
  counts: { imported: number; duplicates: number },
): ImportSummary {
  return {
    total: batch.total,
    imported: counts.imported,
    duplicates: counts.duplicates,
    discarded: batch.discarded,
    discardedDetails: batch.discardedDetails,
    errors: batch.errors,
    instruments: batch.instruments.length,
  };
}

export async function persistBatch(
  instruments: InstrumentRepository,
  ledger: LedgerRepository,
  batch: MappedBatch,
): Promise<ImportSummary> {
  await instruments.upsert(batch.instruments);
  const existing = await ledger.existing(batch.events);
  await ledger.append(batch.events);
  return summarize(batch, countOperations(batch, existing));
}

export async function previewBatch(
  ledger: LedgerRepository,
  batch: MappedBatch,
): Promise<ImportSummary> {
  const existing = await ledger.existing(batch.events);
  return summarize(batch, countOperations(batch, existing));
}
