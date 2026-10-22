import { ECB_SOURCE } from "~/adapters/fx";
import {
  PrismaFxRepository,
  PrismaPriceRepository,
} from "~/adapters/persistence";
import { BASE_CURRENCY } from "~/core/domain";
import { pricesInBase, type RateBook } from "~/core/fx";
import type { PriceSnapshot } from "~/core/ports";

export interface Valuation {
  latest: Map<string, PriceSnapshot>;
  prices: Map<string, PriceSnapshot>;
  unrated: Map<string, string>;
  book: RateBook;
}

export function loadRateBook(currencies: Iterable<string>): Promise<RateBook> {
  const foreign = [...new Set(currencies)].filter((c) => c !== BASE_CURRENCY);
  return new PrismaFxRepository().book(ECB_SOURCE, foreign.sort());
}

export async function loadValuation(now: Date = new Date()): Promise<Valuation> {
  const latest = await new PrismaPriceRepository().latest();
  const book = await loadRateBook(
    [...latest.values()].map((snapshot) => snapshot.currency),
  );
  const { prices, unrated } = pricesInBase(latest, book, now);
  return { latest, prices, unrated, book };
}
