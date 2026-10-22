import { dayOf } from "~/core/calendar";
import {
  fxSourceSchema,
  isUnconvertedForeign,
  ledgerEventWriteSchema,
  type Instrument,
  type LedgerEvent,
} from "~/core/domain";
import {
  ledgerDedupKey,
  type InstrumentRepository,
  type LedgerRepository,
} from "~/core/ports";

import type { DiscardDetail, DiscardReason, NoticeReason } from "./discard";
import { noRates, type RateAt } from "./fx";

export type { DiscardDetail, DiscardReason, NoticeReason } from "./discard";

export type DiscardCounts = Partial<Record<DiscardReason, number>>;
export type DiscardDetails = Partial<Record<DiscardReason, DiscardDetail[]>>;
export type NoticeDetails = Partial<Record<NoticeReason, DiscardDetail[]>>;

export type MappedItem =
  | { kind: "domain"; instrument: Instrument | null; event: LedgerEvent }
  | {
      kind: "discard";
      reason: DiscardReason;
      detail?: DiscardDetail;
      instrument?: Instrument;
    }
  | { kind: "notice"; reason: NoticeReason; detail: DiscardDetail };

export interface MappedBatch {
  total: number;
  instruments: Instrument[];
  events: LedgerEvent[];
  operationOf: number[];
  discarded: DiscardCounts;
  discardedDetails: DiscardDetails;
  noticed: NoticeDetails;
  errors: number;
  ratesNeeded: Map<string, string>;
}

export interface ImportSummary {
  total: number;
  imported: number;
  duplicates: number;
  discarded: DiscardCounts;
  discardedDetails: DiscardDetails;
  noticed: NoticeDetails;
  errors: number;
  instruments: number;
}

export class InvalidLedgerEventError extends Error {
  constructor(
    readonly date: string,
    readonly type: string,
    readonly currency: string,
  ) {
    super(
      `A ${type} on ${date} in ${currency} breaks the ledger's FX rule; nothing was imported`,
    );
    this.name = "InvalidLedgerEventError";
  }
}

export class BatchBuilder {
  constructor(private readonly rateAt: RateAt = noRates) {}

  private invalid: InvalidLedgerEventError | null = null;
  private readonly events: LedgerEvent[] = [];
  private readonly operationOf: number[] = [];
  private operations = 0;
  private readonly instruments = new Map<string, Instrument>();
  private readonly discarded: DiscardCounts = {};
  private readonly discardedDetails: DiscardDetails = {};
  private readonly noticed: NoticeDetails = {};
  private errors = 0;
  private readonly ratesNeeded = new Map<string, string>();

  add(item: MappedItem): void {
    this.addOperation([item]);
  }

  addOperation(items: readonly MappedItem[]): void {
    const operation = this.operations;
    this.operations += 1;

    const converted: MappedItem[] = [];
    for (const item of items) {
      if (item.kind !== "domain" || !isUnconvertedForeign(item.event)) {
        converted.push(item);
        continue;
      }
      const rate = this.rateAt(item.event.currency, item.event.ts);
      if (rate === null) {
        this.needRate(item.event.currency, dayOf(item.event.ts));
        this.addItem(unratedDiscard(item), operation);
        return;
      }
      converted.push({
        ...item,
        event: {
          ...item.event,
          fxSource: fxSourceSchema.parse(rate.source),
          fxRate: rate.rate,
          fxDirection: "QUOTE_PER_BASE",
          fxDate: rate.day,
        },
      });
    }

    for (const item of converted) {
      if (
        item.kind === "domain" &&
        this.invalid === null &&
        !ledgerEventWriteSchema.safeParse(item.event).success
      ) {
        this.invalid = new InvalidLedgerEventError(
          dayOf(item.event.ts),
          item.event.type,
          item.event.currency,
        );
      }
      this.addItem(item, operation);
    }
  }

  addNotice(reason: NoticeReason, detail: DiscardDetail): void {
    const list = this.noticed[reason] ?? [];
    list.push(detail);
    this.noticed[reason] = list;
  }

  private addItem(item: MappedItem, operation: number): void {
    if (item.kind === "notice") {
      this.addNotice(item.reason, item.detail);
      return;
    }
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

  private needRate(currency: string, day: string): void {
    const held = this.ratesNeeded.get(currency);
    if (held === undefined || day < held) this.ratesNeeded.set(currency, day);
  }

  addError(): void {
    this.errors += 1;
  }

  build(total: number): MappedBatch {
    if (this.invalid) throw this.invalid;
    return {
      total,
      instruments: [...this.instruments.values()],
      events: this.events,
      operationOf: this.operationOf,
      discarded: this.discarded,
      discardedDetails: this.discardedDetails,
      noticed: this.noticed,
      errors: this.errors,
      ratesNeeded: this.ratesNeeded,
    };
  }
}

function unratedDiscard(
  item: Extract<MappedItem, { kind: "domain" }>,
): MappedItem {
  const { event } = item;
  const name = item.instrument?.name ?? null;
  return {
    kind: "discard",
    reason: "fx-unavailable",
    detail: {
      date: event.ts.toISOString(),
      type: event.type,
      subtype: null,
      instrument: name ? `${name} (${event.currency})` : event.currency,
    },
  };
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
    noticed: batch.noticed,
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
  await ledger.markInKind(batch.events);
  return summarize(batch, countOperations(batch, existing));
}

export async function previewBatch(
  ledger: LedgerRepository,
  batch: MappedBatch,
): Promise<ImportSummary> {
  const existing = await ledger.existing(batch.events);
  return summarize(batch, countOperations(batch, existing));
}
