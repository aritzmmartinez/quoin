import Decimal from "decimal.js";

import {
  leafKey,
  resolveIntrinsic,
  type ExposureKind,
  type Instrument,
  type InstrumentType,
  type Thesis,
} from "~/core/domain";
import type { EtfHolding } from "~/core/ports";
import type { MarketValue, Position } from "~/core/projections";

export interface InstrumentListItem {
  id: string;
  name: string;
  type: InstrumentType;
  quoteSymbol: string | null;
  exposureKind: ExposureKind | null;
  exposureLeafId: string | null;
  ter: string | null;
  hedgedToBase: boolean;
  thesis: Thesis;
  resolvesTo: string;
  isExplicit: boolean;
  quantity: string;
  isClosed: boolean;
  value: string | null;
  holdingsCount: number;
  holdingsCovered: string | null;
  holdingsAsOf: string | null;
}

export function toInstrumentListItems(
  instruments: readonly Instrument[],
  positions: readonly Position[],
  marketValues: ReadonlyMap<string, MarketValue>,
  holdings: ReadonlyMap<string, EtfHolding[]> = new Map(),
  tag = "es-ES",
): InstrumentListItem[] {
  const held = new Map<string, Decimal>();
  const valued = new Map<string, Decimal>();

  for (const position of positions) {
    held.set(position.instrumentId, new Decimal(position.quantity));

    const marketValue = marketValues.get(position.instrumentId);
    if (marketValue?.marketValue != null) {
      valued.set(position.instrumentId, new Decimal(marketValue.marketValue));
    }
  }

  const items = instruments.map((instrument) => {
    const [leaf] = resolveIntrinsic(instrument);
    const quantity = held.get(instrument.id) ?? new Decimal(0);
    const value = valued.get(instrument.id);
    const composition = holdings.get(instrument.id) ?? [];
    const covered = composition.reduce(
      (sum, h) => sum.plus(new Decimal(h.weight)),
      new Decimal(0),
    );

    return {
      id: instrument.id,
      name: instrument.name,
      type: instrument.type,
      quoteSymbol: instrument.quoteSymbol ?? null,
      exposureKind: instrument.exposureKind ?? null,
      exposureLeafId: instrument.exposureLeafId ?? null,
      ter: instrument.ter ?? null,
      hedgedToBase: instrument.hedgedToBase ?? false,
      thesis: instrument.thesis,
      resolvesTo: leaf ? leafKey(leaf.leaf) : "—",
      isExplicit: Boolean(instrument.exposureKind),
      quantity: quantity.toFixed(),
      isClosed: quantity.isZero(),
      value: value ? value.toFixed(2) : null,
      holdingsCount: composition.length,
      holdingsCovered: composition.length > 0 ? covered.toString() : null,
      holdingsAsOf: composition[0]?.asOf.toISOString() ?? null,
    };
  });

  return items.sort((a, b) => {
    const diff = new Decimal(b.value ?? 0).comparedTo(
      new Decimal(a.value ?? 0),
    );
    return diff !== 0 ? diff : a.name.localeCompare(b.name, tag);
  });
}

export function needsMapping(
  items: readonly InstrumentListItem[],
): InstrumentListItem[] {
  return items.filter(
    (i) => !i.isExplicit && i.resolvesTo.startsWith("UNRESOLVED"),
  );
}
