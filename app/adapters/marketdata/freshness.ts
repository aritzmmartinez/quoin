import type { Quote } from "~/core/ports";

/**
 * A quote older than this (by its market timestamp) is treated as stale and
 * dropped, rather than persisted. Catches providers that serve an ancient last
 * candle for illiquid venues instead of a current price. Generous enough to
 * survive weekends/holidays.
 */
export const MAX_QUOTE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function isFreshQuote(
  quote: Pick<Quote, "asOf">,
  now: Date = new Date(),
  maxAgeMs: number = MAX_QUOTE_AGE_MS,
): boolean {
  const age = now.getTime() - quote.asOf.getTime();
  return age <= maxAgeMs;
}
