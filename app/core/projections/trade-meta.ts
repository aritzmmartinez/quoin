import type { LedgerEvent, Sleeve, TradeEvent } from "../domain";

export interface TradeMeta {
  firstTradeAt: Date;
  lastTradeAt: Date;
  tradeCount: number;
}

function isTrade(event: LedgerEvent): event is TradeEvent {
  return event.type === "BUY" || event.type === "SELL";
}

function keyOf(instrumentId: string, sleeve: Sleeve): string {
  return `${instrumentId}::${sleeve}`;
}

export function computeTradeMeta(
  events: readonly LedgerEvent[],
): Map<string, TradeMeta> {
  const meta = new Map<string, TradeMeta>();

  for (const event of events) {
    if (!isTrade(event)) continue;

    const key = keyOf(event.instrumentId, event.sleeve);
    const existing = meta.get(key);

    if (!existing) {
      meta.set(key, {
        firstTradeAt: event.ts,
        lastTradeAt: event.ts,
        tradeCount: 1,
      });
      continue;
    }

    existing.tradeCount += 1;
    if (event.ts < existing.firstTradeAt) existing.firstTradeAt = event.ts;
    if (event.ts > existing.lastTradeAt) existing.lastTradeAt = event.ts;
  }

  return meta;
}

export function tradeMetaKey(instrumentId: string, sleeve: Sleeve): string {
  return keyOf(instrumentId, sleeve);
}
