import { ZodError } from "zod";

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

import type {
  DiscardDetail,
  DiscardReason,
  NoticeReason,
  RowError,
  RowErrorReason,
} from "./discard";
import { noRates, type RateAt } from "./fx";

export type {
  DiscardDetail,
  DiscardReason,
  NoticeReason,
  RowError,
} from "./discard";

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
      related?: readonly Instrument[];
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
  errors: RowError[];
  ratesNeeded: Map<string, string>;
}

export interface ImportSummary {
  total: number;
  imported: number;
  completed: number;
  duplicates: number;
  discarded: DiscardCounts;
  discardedDetails: DiscardDetails;
  noticed: NoticeDetails;
  errors: RowError[];
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
  constructor(
    private readonly zone: string,
    private readonly rateAt: RateAt = noRates,
  ) {}

  private invalid: InvalidLedgerEventError | null = null;
  private readonly events: LedgerEvent[] = [];
  private readonly operationOf: number[] = [];
  private operations = 0;
  private readonly instruments = new Map<string, Instrument>();
  private readonly discarded: DiscardCounts = {};
  private readonly discardedDetails: DiscardDetails = {};
  private readonly noticed: NoticeDetails = {};
  private readonly errors: RowError[] = [];
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
        this.needRate(item.event.currency, dayOf(item.event.ts, this.zone));
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
          dayOf(item.event.ts, this.zone),
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
      for (const instrument of [item.instrument, ...(item.related ?? [])]) {
        if (instrument) this.instruments.set(instrument.id, instrument);
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

  addError(error: RowError): void {
    this.errors.push(error);
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

export function rowErrorReason(error: unknown): RowErrorReason {
  if (error instanceof ZodError) {
    const fields = error.issues.map((issue) => issue.path[0]);
    return fields.includes("id") ? "missing-instrument" : "invalid-number";
  }
  if (error instanceof Error && error.message.startsWith("[DecimalError]"))
    return "invalid-number";
  return "unexpected";
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

export interface OperationCounts {
  imported: number;
  completed: number;
  duplicates: number;
}

export function countOperations(
  batch: MappedBatch,
  existing: ReadonlySet<string>,
): OperationCounts {
  const operations = new Map<number, { stored: boolean; fresh: boolean }>();
  batch.events.forEach((event, index) => {
    const operation = batch.operationOf[index] ?? index;
    const isNew =
      !event.externalId ||
      !existing.has(ledgerDedupKey(event.source, event.externalId));
    const seen = operations.get(operation) ?? { stored: false, fresh: false };
    if (isNew) seen.fresh = true;
    else seen.stored = true;
    operations.set(operation, seen);
  });
  const counts = { imported: 0, completed: 0, duplicates: 0 };
  for (const { stored, fresh } of operations.values()) {
    if (!fresh) counts.duplicates += 1;
    else if (stored) counts.completed += 1;
    else counts.imported += 1;
  }
  return counts;
}

export function operationsToWrite(
  counts: Pick<OperationCounts, "imported" | "completed">,
): number {
  return counts.imported + counts.completed;
}

export function writesLedger(
  counts: Pick<OperationCounts, "imported" | "completed">,
): boolean {
  return operationsToWrite(counts) > 0;
}

function summarize(batch: MappedBatch, counts: OperationCounts): ImportSummary {
  return {
    total: batch.total,
    imported: counts.imported,
    completed: counts.completed,
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
