import { rateDayFor } from "../calendar";
import { BASE_CURRENCY } from "../domain";
import type { FxRate } from "../ports";
import { onOrBeforeDay } from "../series";

export const VALUATION_RATE_MAX_AGE_DAYS = 7;

export type RateBook = ReadonlyMap<string, readonly FxRate[]>;

export function rateBookFrom(rates: Iterable<FxRate>): RateBook {
  const byQuote = new Map<string, FxRate[]>();
  for (const rate of rates) {
    if (rate.base !== BASE_CURRENCY) {
      throw new Error(
        `A rate book is against ${BASE_CURRENCY}, got ${rate.base}:${rate.quote} on ${rate.day}`,
      );
    }
    const series = byQuote.get(rate.quote) ?? [];
    series.push(rate);
    byQuote.set(rate.quote, series);
  }
  for (const [quote, series] of byQuote) {
    series.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    for (let i = 1; i < series.length; i += 1) {
      if (series[i]!.day === series[i - 1]!.day) {
        throw new Error(`Two rates for ${quote} on ${series[i]!.day}`);
      }
    }
  }
  return byQuote;
}

export function bookingRate(
  book: RateBook,
  currency: string,
  day: string,
): FxRate | null {
  const series = book.get(currency);
  if (!series) return null;
  const wanted = rateDayFor(day);
  const found = onOrBeforeDay(series, (rate) => rate.day, wanted, 0);
  return found?.day === wanted ? found : null;
}

export function valuationRate(
  book: RateBook,
  currency: string,
  day: string,
): FxRate | null {
  const series = book.get(currency);
  if (!series) return null;
  return onOrBeforeDay(
    series,
    (rate) => rate.day,
    day,
    VALUATION_RATE_MAX_AGE_DAYS,
  );
}
