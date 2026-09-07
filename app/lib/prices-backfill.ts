import type {
  HistoryRange,
  MarketDataProvider,
  PriceRepository,
  PriceSnapshot,
  Quote,
} from "~/core/ports";

export const HISTORY_RANGES: readonly HistoryRange[] = [
  "1y",
  "2y",
  "5y",
  "10y",
  "max",
];

export const DEFAULT_HISTORY_RANGE: HistoryRange = "5y";

export function isHistoryRange(value: string): value is HistoryRange {
  return (HISTORY_RANGES as readonly string[]).includes(value);
}

export interface BackfillReport {
  instrumentId: string;
  symbol: string;
  written: number;
  first: string | null;
  last: string | null;
  currency: string | null;
  weekly: boolean;
}

export interface BackfillTarget {
  id: string;
  quoteSymbol: string;
}

export function medianGapDays(quotes: readonly { asOf: Date }[]): number {
  if (quotes.length < 2) return 0;
  const gaps = quotes
    .slice(1)
    .map(
      (quote, i) =>
        (quote.asOf.getTime() - quotes[i]!.asOf.getTime()) / 86_400_000,
    )
    .sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 === 0 ? (gaps[mid - 1]! + gaps[mid]!) / 2 : gaps[mid]!;
}

function reportOf(
  target: BackfillTarget,
  quotes: readonly Quote[],
  written: number,
): BackfillReport {
  return {
    instrumentId: target.id,
    symbol: target.quoteSymbol,
    written,
    first: quotes[0]?.asOf.toISOString() ?? null,
    last: quotes[quotes.length - 1]?.asOf.toISOString() ?? null,
    currency: quotes[0]?.currency ?? null,
    weekly: medianGapDays(quotes) >= 4,
  };
}

export async function backfillInstrument(
  provider: MarketDataProvider,
  prices: PriceRepository,
  target: BackfillTarget,
  range: HistoryRange,
): Promise<BackfillReport> {
  const quotes = await provider.getHistory(target.quoteSymbol, range);
  if (quotes.length === 0) return reportOf(target, quotes, 0);

  const snapshots: PriceSnapshot[] = quotes.map((quote) => ({
    instrumentId: target.id,
    price: quote.price,
    currency: quote.currency,
    asOf: quote.asOf,
    source: provider.source,
  }));

  return reportOf(target, quotes, await prices.saveMany(snapshots));
}

export async function backfillInstruments(
  provider: MarketDataProvider,
  prices: PriceRepository,
  targets: readonly BackfillTarget[],
  range: HistoryRange,
): Promise<BackfillReport[]> {
  const reports: BackfillReport[] = [];
  for (const target of targets) {
    reports.push(await backfillInstrument(provider, prices, target, range));
  }
  return reports;
}
