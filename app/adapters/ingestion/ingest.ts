import type { Instrument, LedgerEvent } from "~/core/domain";
import type { InstrumentRepository, LedgerRepository } from "~/core/ports";

export type MappedItem =
  | { kind: "domain"; instrument: Instrument | null; event: LedgerEvent }
  | { kind: "discard"; reason: string };

export interface MappedBatch {
  total: number;
  instruments: Instrument[];
  events: LedgerEvent[];
  discarded: Record<string, number>;
  errors: number;
}

export interface ImportSummary {
  total: number;
  imported: number;
  duplicates: number;
  discarded: Record<string, number>;
  errors: number;
  instruments: number;
}

export class BatchBuilder {
  private readonly events: LedgerEvent[] = [];
  private readonly instruments = new Map<string, Instrument>();
  private readonly discarded: Record<string, number> = {};
  private errors = 0;

  add(item: MappedItem): void {
    if (item.kind === "discard") {
      this.discarded[item.reason] = (this.discarded[item.reason] ?? 0) + 1;
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
    errors: batch.errors,
    instruments: batch.instruments.length,
  };
}
