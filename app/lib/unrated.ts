import Decimal from "decimal.js";

import type { Instrument } from "~/core/domain";
import type { Position } from "~/core/projections";

export interface UnratedNames {
  names: string[];
  currencies: string[];
}

export function unratedNames(
  unrated: ReadonlyMap<string, string>,
  instruments: readonly Instrument[],
  relevant: Iterable<string>,
  tag = "es-ES",
): UnratedNames | null {
  const names = new Map(instruments.map((i) => [i.id, i.name]));
  const hits = [...new Set(relevant)].flatMap((id) => {
    const currency = unrated.get(id);
    return currency === undefined
      ? []
      : [{ name: names.get(id) ?? id, currency }];
  });
  if (hits.length === 0) return null;

  const collator = new Intl.Collator(tag);
  return {
    names: hits.map((hit) => hit.name).sort(collator.compare),
    currencies: [...new Set(hits.map((hit) => hit.currency))].sort(),
  };
}

export function openInstrumentIds(positions: readonly Position[]): string[] {
  return positions
    .filter((position) => new Decimal(position.quantity).gt(0))
    .map((position) => position.instrumentId);
}
