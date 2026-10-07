import Decimal from "decimal.js";

import { Money, leafKey, type LeafId, type WeightedLeaf } from "../domain";
import type { MarketValue } from "./market-value";
import type { Position } from "./positions";

export interface Contribution {
  instrumentId: string;
  instrumentName: string;
  value: string;
  weightInParent: string | null;
}

export interface LeafExposureInput {
  leaf: LeafId;
  name: string;
  contributions: Contribution[];
}

export interface LeafExposure extends LeafExposureInput {
  readonly total: string;
  readonly weight: string | null;
}

export function computeExposures(
  positions: readonly Position[],
  marketValues: ReadonlyMap<string, MarketValue>,
  resolutions: ReadonlyMap<string, readonly WeightedLeaf[]>,
  instrumentNames: ReadonlyMap<string, string> = new Map(),
): LeafExposure[] {
  const byLeaf = new Map<string, LeafExposureInput>();

  for (const position of positions) {
    if (new Decimal(position.quantity).isZero()) continue;

    const marketValue = marketValues.get(position.instrumentId);
    if (!marketValue || marketValue.marketValue === null) continue;

    const value = new Decimal(marketValue.marketValue);
    if (value.isZero()) continue;

    const leaves = resolutions.get(position.instrumentId) ?? [];
    for (const weighted of leaves) {
      const weight = new Decimal(weighted.weight);
      if (weight.isZero()) continue;

      const key = leafKey(weighted.leaf);
      const existing = byLeaf.get(key);
      const exposure: LeafExposureInput = existing ?? {
        leaf: weighted.leaf,
        name: weighted.name,
        contributions: [],
      };

      const weightInParent = weight.equals(1) ? null : weight.toString();

      if (weightInParent === null) exposure.name = weighted.name;

      exposure.contributions.push({
        instrumentId: position.instrumentId,
        instrumentName:
          instrumentNames.get(position.instrumentId) ?? weighted.name,
        value: value.mul(weight).toFixed(2),
        weightInParent,
      });

      byLeaf.set(key, exposure);
    }
  }

  const exposures = withLeafTotals([...byLeaf.values()]);
  const totals = new Map(
    exposures.map((exposure) => [exposure, new Decimal(exposure.total)]),
  );
  return exposures.sort((a, b) => totals.get(b)!.comparedTo(totals.get(a)!));
}

export function withLeafTotals(
  leaves: readonly LeafExposureInput[],
  total?: string,
): LeafExposure[] {
  const totals = leaves.map(leafTotal);
  const denominator = new Decimal(
    total ??
      totals
        .reduce((sum, value) => sum.add(Money.fromString(value)), Money.zero())
        .toString(),
  );
  return leaves.map((leaf, index) => {
    const leafTotalValue = totals[index]!;
    return {
      ...leaf,
      total: leafTotalValue,
      weight: denominator.isZero()
        ? null
        : new Decimal(leafTotalValue).div(denominator).toFixed(6),
    };
  });
}

export function leafTotal(exposure: LeafExposureInput): string {
  return exposure.contributions
    .reduce((sum, c) => sum.add(Money.fromString(c.value)), Money.zero())
    .toString();
}

export function leafWeight(
  exposure: LeafExposureInput,
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
    const value = Money.fromString(exposure.total);
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
