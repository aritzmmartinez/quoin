import Decimal from "decimal.js";

import { Money, leafKey, type LeafId, type WeightedLeaf } from "../domain";
import type { MarketValue } from "./market-value";
import type { Position } from "./positions";
import { tradeMetaKey } from "./trade-meta";

export interface Contribution {
  instrumentId: string;
  instrumentName: string;
  value: string;
  weightInParent: string | null;
}

export interface LeafExposure {
  leaf: LeafId;
  name: string;
  contributions: Contribution[];
}

export function computeExposures(
  positions: readonly Position[],
  marketValues: ReadonlyMap<string, MarketValue>,
  resolutions: ReadonlyMap<string, readonly WeightedLeaf[]>,
): LeafExposure[] {
  const byLeaf = new Map<string, LeafExposure>();

  for (const position of positions) {
    if (new Decimal(position.quantity).isZero()) continue;

    const marketValue = marketValues.get(
      tradeMetaKey(position.instrumentId, position.sleeve),
    );
    if (!marketValue || marketValue.marketValue === null) continue;

    const value = new Decimal(marketValue.marketValue);
    if (value.isZero()) continue;

    const leaves = resolutions.get(position.instrumentId) ?? [];
    for (const weighted of leaves) {
      const weight = new Decimal(weighted.weight);
      if (weight.isZero()) continue;

      const key = leafKey(weighted.leaf);
      const existing = byLeaf.get(key);
      const exposure: LeafExposure = existing ?? {
        leaf: weighted.leaf,
        name: weighted.name,
        contributions: [],
      };

      exposure.contributions.push({
        instrumentId: position.instrumentId,
        instrumentName: weighted.name,
        value: value.mul(weight).toFixed(2),
        weightInParent: weight.equals(1) ? null : weight.toString(),
      });

      byLeaf.set(key, exposure);
    }
  }

  return [...byLeaf.values()].sort((a, b) =>
    new Decimal(leafTotal(b)).comparedTo(new Decimal(leafTotal(a))),
  );
}

export function leafTotal(exposure: LeafExposure): string {
  return exposure.contributions
    .reduce((sum, c) => sum.add(Money.fromString(c.value)), Money.zero())
    .toString();
}

export function leafWeight(
  exposure: LeafExposure,
  total: string,
): string | null {
  const denominator = new Decimal(total);
  if (denominator.isZero()) return null;
  return new Decimal(leafTotal(exposure)).div(denominator).toFixed(6);
}

export interface ExposureSummary {
  total: string;
  unresolved: string;
  resolvedLeafCount: number;
}

export function summarizeExposures(
  exposures: readonly LeafExposure[],
): ExposureSummary {
  let total = Money.zero();
  let unresolved = Money.zero();
  let resolvedLeafCount = 0;

  for (const exposure of exposures) {
    const value = Money.fromString(leafTotal(exposure));
    total = total.add(value);
    if (exposure.leaf.kind === "UNRESOLVED") unresolved = unresolved.add(value);
    else resolvedLeafCount += 1;
  }

  return {
    total: total.toString(),
    unresolved: unresolved.toString(),
    resolvedLeafCount,
  };
}
