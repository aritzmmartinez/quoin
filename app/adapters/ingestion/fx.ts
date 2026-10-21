import { dayOf } from "~/core/calendar";
import { BASE_CURRENCY } from "~/core/domain";
import { bookingRate, type RateBook } from "~/core/fx";
import type { FxRate } from "~/core/ports";

export type RateAt = (currency: string, at: Date) => FxRate | null;

export type RateBookLoader = (
  currencies: readonly string[],
) => Promise<RateBook>;

export const noRates: RateAt = () => null;

export function rateLookupFrom(book: RateBook): RateAt {
  return (currency, at) => bookingRate(book, currency, dayOf(at));
}

export async function rateLookupFor(
  load: RateBookLoader | null,
  currencies: Iterable<string>,
): Promise<RateAt> {
  const foreign = [...new Set(currencies)]
    .filter((currency) => currency !== BASE_CURRENCY)
    .sort();
  if (load === null || foreign.length === 0) return noRates;
  return rateLookupFrom(await load(foreign));
}
