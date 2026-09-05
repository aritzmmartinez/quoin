import { isFreshQuote } from "~/adapters/marketdata";
import type { Instrument } from "~/core/domain";
import type { PriceSnapshot, Quote } from "~/core/ports";

import { es } from "./i18n";

export type SyncableInstrument = Pick<
  Instrument,
  "id" | "name" | "quoteSymbol"
>;

export interface PriceSyncFailure {
  instrumentId: string;
  name: string;
  symbol: string;
  reason: "stale" | "no-quote";
  asOf: Date | null;
}

export interface UnmappedInstrument {
  instrumentId: string;
  name: string;
}

export interface PriceSyncPlan {
  mapped: number;
  unmapped: UnmappedInstrument[];
  snapshots: PriceSnapshot[];
  failures: PriceSyncFailure[];
}

export function planPriceSync(
  instruments: readonly SyncableInstrument[],
  quotes: readonly Quote[],
  source: string,
  now: Date = new Date(),
): PriceSyncPlan {
  const unmapped: UnmappedInstrument[] = [];
  const idsBySymbol = new Map<string, SyncableInstrument[]>();

  for (const instrument of instruments) {
    const symbol = instrument.quoteSymbol;
    if (!symbol) {
      unmapped.push({ instrumentId: instrument.id, name: instrument.name });
      continue;
    }
    const bucket = idsBySymbol.get(symbol);
    if (bucket) bucket.push(instrument);
    else idsBySymbol.set(symbol, [instrument]);
  }

  const mapped = instruments.length - unmapped.length;
  const snapshots: PriceSnapshot[] = [];
  const failures: PriceSyncFailure[] = [];
  const answered = new Set<string>();

  for (const quote of quotes) {
    const holders = idsBySymbol.get(quote.symbol);
    if (!holders) continue;
    if (answered.has(quote.symbol)) continue;
    answered.add(quote.symbol);

    const fresh = isFreshQuote(quote, now);
    for (const instrument of holders) {
      if (!fresh) {
        failures.push({
          instrumentId: instrument.id,
          name: instrument.name,
          symbol: quote.symbol,
          reason: "stale",
          asOf: quote.asOf,
        });
        continue;
      }
      snapshots.push({
        instrumentId: instrument.id,
        price: quote.price,
        currency: quote.currency,
        asOf: quote.asOf,
        source,
      });
    }
  }

  for (const [symbol, holders] of idsBySymbol) {
    if (answered.has(symbol)) continue;
    for (const instrument of holders) {
      failures.push({
        instrumentId: instrument.id,
        name: instrument.name,
        symbol,
        reason: "no-quote",
        asOf: null,
      });
    }
  }

  return { mapped, unmapped, snapshots, failures };
}

export interface PriceSyncCounts {
  mapped: number;
  updated: number;
  stale: number;
  noQuote: number;
}

export interface PriceSyncToast {
  message: string;
  description?: string;
}

export function priceSyncToast(counts: PriceSyncCounts): PriceSyncToast {
  const copy = es.instruments.sync;
  if (counts.mapped === 0) return { message: copy.nothing };

  const failed = counts.stale + counts.noQuote;
  const headline = copy.done(counts.updated, counts.mapped);
  if (failed === 0) return { message: headline };

  const description = [
    counts.stale > 0 ? copy.staleDetail(counts.stale) : null,
    counts.noQuote > 0 ? copy.noQuoteDetail(counts.noQuote) : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return { message: `${headline}, ${copy.failed(failed)}`, description };
}
