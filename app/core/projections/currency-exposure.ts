import Decimal from "decimal.js";

import { Money, leafKey } from "../domain";
import type { LeafExposure } from "./exposures";

export interface CurrencyBucket {
  currency: string | null;
  value: string;
  weight: string | null;
}

export interface CurrencyExposure {
  buckets: CurrencyBucket[];
  total: string;
  base: string;
  foreign: string;
  unresolved: string;
}

export interface CurrencyExposureInput {
  exposures: readonly LeafExposure[];
  currencyByLeaf: ReadonlyMap<string, string>;
  hedgedInstruments: ReadonlySet<string>;
  base?: string;
}

export function computeCurrencyExposure({
  exposures,
  currencyByLeaf,
  hedgedInstruments,
  base = "EUR",
}: CurrencyExposureInput): CurrencyExposure {
  const byCurrency = new Map<string | null, Money>();
  let total = Money.zero();

  for (const exposure of exposures) {
    const listed = currencyByLeaf.get(leafKey(exposure.leaf)) ?? null;

    for (const contribution of exposure.contributions) {
      const currency = hedgedInstruments.has(contribution.instrumentId)
        ? base
        : listed;

      const value = Money.fromString(contribution.value);
      byCurrency.set(
        currency,
        (byCurrency.get(currency) ?? Money.zero()).add(value),
      );
      total = total.add(value);
    }
  }

  const denominator = new Decimal(total.toString());
  const buckets = [...byCurrency.entries()]
    .map(([currency, value]) => ({
      currency,
      value: value.toString(),
      weight: denominator.isZero()
        ? null
        : new Decimal(value.toString()).div(denominator).toFixed(6),
    }))
    .sort((a, b) => {
      if (a.currency === null) return 1;
      if (b.currency === null) return -1;
      return new Decimal(b.value).comparedTo(new Decimal(a.value));
    });

  const sum = (predicate: (bucket: CurrencyBucket) => boolean): string =>
    buckets
      .filter(predicate)
      .reduce(
        (acc, bucket) => acc.add(Money.fromString(bucket.value)),
        Money.zero(),
      )
      .toString();

  return {
    buckets,
    total: total.toString(),
    base: sum((bucket) => bucket.currency === base),
    foreign: sum(
      (bucket) => bucket.currency !== null && bucket.currency !== base,
    ),
    unresolved: sum((bucket) => bucket.currency === null),
  };
}
