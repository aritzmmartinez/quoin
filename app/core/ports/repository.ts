import type { LedgerEvent, Sleeve } from "../domain";

export interface LedgerEventFilter {
  instrumentId?: string;
  sleeve?: Sleeve;
}

export interface LedgerRepository {
  append(
    events: readonly LedgerEvent[],
  ): Promise<{ inserted: number; skipped: number }>;

  list(filter?: LedgerEventFilter): Promise<LedgerEvent[]>;
}
