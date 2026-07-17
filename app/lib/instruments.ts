import Decimal from "decimal.js";

import {
  leafKey,
  resolveIntrinsic,
  type ExposureKind,
  type Instrument,
  type InstrumentType,
} from "~/core/domain";
import { tradeMetaKey, type MarketValue, type Position } from "~/core/projections";

/**
 * An instrument as the admin screen needs it: what it is, how it resolves, and
 * whether it is actually held. Serializable, so it crosses the loader boundary.
 */
export interface InstrumentListItem {
  id: string;
  name: string;
  type: InstrumentType;
  quoteSymbol: string | null;
  exposureKind: ExposureKind | null;
  exposureLeafId: string | null;
  /** e.g. "COMMODITY:XAU" — the leaf the current settings produce. */
  resolvesTo: string;
  /** False when the resolution comes from the type default, not a mapping. */
  isExplicit: boolean;
  quantity: string;
  /**
   * A closed position derives every number as zero, so a wrong mapping looks
   * exactly like a right one. Surfacing it is what the CLI lacked when the wrong
   * S&P 500 symbol went unnoticed.
   */
  isClosed: boolean;
  /** Null when unpriced — never zero, which would read as "worth nothing". */
  value: string | null;
}

export function toInstrumentListItems(
  instruments: readonly Instrument[],
  positions: readonly Position[],
  marketValues: ReadonlyMap<string, MarketValue>,
): InstrumentListItem[] {
  const held = new Map<string, Decimal>();
  const valued = new Map<string, Decimal>();

  for (const position of positions) {
    const quantity = new Decimal(position.quantity);
    held.set(
      position.instrumentId,
      (held.get(position.instrumentId) ?? new Decimal(0)).plus(quantity),
    );

    const marketValue = marketValues.get(
      tradeMetaKey(position.instrumentId, position.sleeve),
    );
    if (marketValue?.marketValue != null) {
      valued.set(
        position.instrumentId,
        (valued.get(position.instrumentId) ?? new Decimal(0)).plus(
          new Decimal(marketValue.marketValue),
        ),
      );
    }
  }

  const items = instruments.map((instrument) => {
    const [leaf] = resolveIntrinsic(instrument);
    const quantity = held.get(instrument.id) ?? new Decimal(0);
    const value = valued.get(instrument.id);

    return {
      id: instrument.id,
      name: instrument.name,
      type: instrument.type,
      quoteSymbol: instrument.quoteSymbol ?? null,
      exposureKind: instrument.exposureKind ?? null,
      exposureLeafId: instrument.exposureLeafId ?? null,
      resolvesTo: leaf ? leafKey(leaf.leaf) : "—",
      isExplicit: Boolean(instrument.exposureKind),
      quantity: quantity.toFixed(),
      isClosed: quantity.isZero(),
      value: value ? value.toFixed(2) : null,
    };
  });

  // By value, descending. The repository orders by id, which is right for an API
  // and useless for a human: it puts "BTC" first purely because B sorts early.
  // Closed positions are worth nothing, so they sink on their own; ties fall back
  // to name so the order is stable rather than incidental.
  return items.sort((a, b) => {
    const diff = new Decimal(b.value ?? 0).comparedTo(new Decimal(a.value ?? 0));
    return diff !== 0 ? diff : a.name.localeCompare(b.name, "es");
  });
}

/** Instruments still riding the type default and landing on UNRESOLVED. */
export function needsMapping(items: readonly InstrumentListItem[]): InstrumentListItem[] {
  return items.filter((i) => !i.isExplicit && i.resolvesTo.startsWith("UNRESOLVED"));
}
