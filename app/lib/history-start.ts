import type { LedgerEvent } from "~/core/domain";

export function firstEventByInstrument(
  events: readonly LedgerEvent[],
): Map<string, Date> {
  const first = new Map<string, Date>();
  for (const event of events) {
    if (!("instrumentId" in event)) continue;
    const seen = first.get(event.instrumentId);
    if (!seen || event.ts < seen) first.set(event.instrumentId, event.ts);
  }
  return first;
}

export function firstTradeAt(events: readonly LedgerEvent[]): Date | undefined {
  let first: Date | undefined;
  for (const event of events) {
    if (event.type !== "BUY" && event.type !== "SELL") continue;
    if (!first || event.ts < first) first = event.ts;
  }
  return first;
}
