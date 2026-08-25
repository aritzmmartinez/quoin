import Decimal from "decimal.js";

import { leafKey, type WeightedLeaf } from "../domain";

/**
 * How much of two funds is the same company.
 *
 * The industry formula: `Σ min(weight_A(company), weight_B(company))` over the
 * companies both funds hold. The weight is the holding's weight **inside its own
 * fund** — the composition that sums to ~1 — never the weight of that position
 * in the portfolio. Overlap is a property of the two funds; how much is invested
 * in each does not change how alike they are.
 *
 * No division anywhere, so an empty intersection is an exact `0`, never NaN.
 */
export interface OverlapContributor {
  key: string;
  id: string;
  name: string;
  weight: string;
  weightA: string;
  weightB: string;
}

export type CashPredicate = (leafId: string, name: string) => boolean;

export interface FundOverlap {
  overlap: string;
  shared: number;
  contributors: OverlapContributor[];
}

export interface FundOverlapPair extends FundOverlap {
  a: string;
  b: string;
}

export const MAX_CONTRIBUTORS = 5;

interface FundWeight {
  id: string;
  name: string;
  weight: Decimal;
}

function weightsOf(leaves: readonly WeightedLeaf[]): Map<string, FundWeight> {
  const byLeaf = new Map<string, FundWeight>();

  for (const weighted of leaves) {
    if (weighted.leaf.kind === "UNRESOLVED") continue;
    const weight = new Decimal(weighted.weight);
    if (weight.lte(0)) continue;

    const key = leafKey(weighted.leaf);
    const known = byLeaf.get(key);
    byLeaf.set(key, {
      id: weighted.leaf.id,
      name: known?.name ?? weighted.name,
      weight: (known?.weight ?? new Decimal(0)).plus(weight),
    });
  }

  return byLeaf;
}

export function computeFundOverlap(
  fundA: readonly WeightedLeaf[],
  fundB: readonly WeightedLeaf[],
  isCash?: CashPredicate,
): FundOverlap {
  const a = weightsOf(fundA);
  const b = weightsOf(fundB);

  let total = new Decimal(0);
  const contributors: OverlapContributor[] = [];

  for (const [key, entry] of a) {
    const other = b.get(key);
    if (other === undefined) continue;

    const min = Decimal.min(entry.weight, other.weight);
    total = total.plus(min);
    contributors.push({
      key,
      id: entry.id,
      name: entry.name,
      weight: min.toFixed(6),
      weightA: entry.weight.toFixed(6),
      weightB: other.weight.toFixed(6),
    });
  }

  contributors.sort((x, y) => new Decimal(y.weight).comparedTo(x.weight));

  const shown = isCash
    ? contributors.filter((c) => !isCash(c.id, c.name))
    : contributors;

  return {
    overlap: total.toFixed(6),
    shared: contributors.length,
    contributors: shown.slice(0, MAX_CONTRIBUTORS),
  };
}

export function computeAllFundOverlaps(
  funds: ReadonlyMap<string, readonly WeightedLeaf[]>,
  isCash?: CashPredicate,
): FundOverlapPair[] {
  const ids = [...funds.keys()];
  const pairs: FundOverlapPair[] = [];

  for (const [index, a] of ids.entries()) {
    const leavesA = funds.get(a) ?? [];
    for (const b of ids.slice(index + 1)) {
      pairs.push({
        a,
        b,
        ...computeFundOverlap(leavesA, funds.get(b) ?? [], isCash),
      });
    }
  }

  return pairs.sort((x, y) => new Decimal(y.overlap).comparedTo(x.overlap));
}
