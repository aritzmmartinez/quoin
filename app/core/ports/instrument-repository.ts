import type { Instrument } from "../domain";

/**
 * Port for the instrument master (reference data). Implemented by an adapter.
 * Ingestion upserts instruments before appending ledger entries that reference them.
 */
export interface InstrumentRepository {
  /** Idempotent create-or-update of instruments, keyed by id. */
  upsert(instruments: readonly Instrument[]): Promise<void>;
  list(): Promise<Instrument[]>;
  get(id: string): Promise<Instrument | null>;
}
