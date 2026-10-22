import { dayOf } from "~/core/calendar";
import {
  HISTORY_RANGE_DAYS,
  MarketDataUnavailableError,
  type HistoryRange,
  type MarketDataProvider,
  type PriceRepository,
  type PriceSnapshot,
  type Quote,
} from "~/core/ports";

import { rateSeriesOf, type EnsureRates } from "./fx-sync";

export const HISTORY_RANGES: readonly HistoryRange[] = [
  "1y",
  "2y",
  "5y",
  "10y",
  "max",
];

export const DEFAULT_HISTORY_RANGE: HistoryRange = "5y";

export function rangeCovering(
  from: Date,
  now: Date,
  marginDays = 7,
): HistoryRange {
  const needed = (now.getTime() - from.getTime()) / 86_400_000 + marginDays;
  for (const range of HISTORY_RANGES) {
    if (range !== "max" && HISTORY_RANGE_DAYS[range] >= needed) return range;
  }
  return "max";
}

export function widerRange(a: HistoryRange, b: HistoryRange): HistoryRange {
  return HISTORY_RANGES.indexOf(a) >= HISTORY_RANGES.indexOf(b) ? a : b;
}

export function rangeSince(earliest: Date | null, now: Date): HistoryRange {
  return earliest === null
    ? DEFAULT_HISTORY_RANGE
    : widerRange(DEFAULT_HISTORY_RANGE, rangeCovering(earliest, now));
}

export function historyCutoff(range: HistoryRange, now: Date): Date | null {
  return range === "max"
    ? null
    : new Date(now.getTime() - HISTORY_RANGE_DAYS[range] * 86_400_000);
}

export function lostHistoryBefore(
  range: HistoryRange,
  earliest: Date | null,
  now: Date,
): Date | null {
  const cutoff = historyCutoff(range, now);
  if (!cutoff || !earliest) return null;
  return earliest.getTime() < cutoff.getTime() ? cutoff : null;
}

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
  noRateSeries: string | null;
  ratesUnavailable: string | null;
  weekly: boolean;
  unavailable: string | null;
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
    noRateSeries: null,
    ratesUnavailable: null,
    weekly: medianGapDays(quotes) >= 4,
    unavailable: null,
  };
}

export async function backfillInstrument(
  provider: MarketDataProvider,
  prices: PriceRepository,
  target: BackfillTarget,
  range: HistoryRange,
  rates: EnsureRates,
): Promise<BackfillReport> {
  const quotes = await provider.getHistory(target.quoteSymbol, range);
  const first = quotes[0];
  if (!first) return reportOf(target, quotes, 0);

  const needs = new Map<string, string>();
  for (const quote of quotes) {
    const day = dayOf(quote.asOf);
    const held = needs.get(quote.currency);
    if (held === undefined || day < held) needs.set(quote.currency, day);
  }
  const ensured = await rates(needs);
  for (const currency of needs.keys()) {
    const series = rateSeriesOf(ensured, currency);
    if (series === "none") {
      return { ...reportOf(target, quotes, 0), noRateSeries: currency };
    }
    if (series === "unavailable") {
      return { ...reportOf(target, quotes, 0), ratesUnavailable: currency };
    }
  }

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
  rates: EnsureRates,
): Promise<BackfillReport[]> {
  const reports: BackfillReport[] = [];
  for (const target of targets) {
    try {
      reports.push(
        await backfillInstrument(provider, prices, target, range, rates),
      );
    } catch (error) {
      if (!(error instanceof MarketDataUnavailableError)) throw error;
      reports.push({ ...reportOf(target, [], 0), unavailable: error.message });
    }
  }
  return reports;
}
