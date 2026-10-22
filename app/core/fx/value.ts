import { dayOf } from "../calendar";
import { Amount, BASE_CURRENCY } from "../domain";
import type { PriceSnapshot } from "../ports";
import { valuationRate, type RateBook } from "./rates";

interface Priced {
  price: string;
  currency: string;
}

function inBase<P extends Priced>(
  price: P,
  book: RateBook,
  day: string,
): P | null {
  if (price.currency === BASE_CURRENCY) return price;
  const rate = valuationRate(book, price.currency, day);
  if (rate === null) return null;
  return {
    ...price,
    price: Amount.of(price.price, price.currency)
      .inBase(rate.rate, "QUOTE_PER_BASE")
      .toString(),
    currency: BASE_CURRENCY,
  };
}

export interface PricesInBase<P> {
  prices: Map<string, P>;
  unrated: Map<string, string>;
}

export function pricesInBase<P extends Priced>(
  prices: ReadonlyMap<string, P>,
  book: RateBook,
  now: Date,
): PricesInBase<P> {
  const today = dayOf(now);
  const converted = new Map<string, P>();
  const unrated = new Map<string, string>();
  for (const [instrumentId, price] of prices) {
    const based = inBase(price, book, today);
    if (based === null) unrated.set(instrumentId, price.currency);
    else converted.set(instrumentId, based);
  }
  return { prices: converted, unrated };
}

export interface HistoryInBase {
  history: PriceSnapshot[];
  unrated: number;
}

export function historyInBase(
  history: readonly PriceSnapshot[],
  book: RateBook,
): HistoryInBase {
  const converted: PriceSnapshot[] = [];
  let unrated = 0;
  for (const snapshot of history) {
    const based = inBase(snapshot, book, dayOf(snapshot.asOf));
    if (based === null) unrated += 1;
    else converted.push(based);
  }
  return { history: converted, unrated };
}
