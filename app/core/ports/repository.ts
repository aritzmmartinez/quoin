import type { LedgerEvent, Sleeve } from "../domain";

export interface LedgerEventFilter {
  instrumentId?: string;
  sleeve?: Sleeve;
}

export function ledgerDedupKey(source: string, externalId: string): string {
  return `${source}::${externalId}`;
}

export interface LedgerRepository {
  append(
    events: readonly LedgerEvent[],
  ): Promise<{ inserted: number; skipped: number }>;
  list(filter?: LedgerEventFilter): Promise<LedgerEvent[]>;
  existing(events: readonly LedgerEvent[]): Promise<Set<string>>;
}
