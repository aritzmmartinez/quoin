import type { LedgerEvent, Sleeve } from "../domain";

export interface LedgerEventFilter {
  instrumentId?: string;
  sleeve?: Sleeve;
}

/**
 * Port for reading and appending ledger events. Implemented by an adapter
 * (e.g. Prisma over SQLite) in the adapters layer. Core depends on this interface,
 * never on the concrete adapter.
 */
export interface LedgerRepository {
  /**
   * Append events idempotently: entries whose (source, externalId) already exist
   * are skipped. Returns how many were inserted vs skipped.
   */
  append(
    events: readonly LedgerEvent[],
  ): Promise<{ inserted: number; skipped: number }>;

  /** All events in chronological order, optionally narrowed. */
  list(filter?: LedgerEventFilter): Promise<LedgerEvent[]>;
}
