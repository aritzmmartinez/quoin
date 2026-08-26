import Decimal from "decimal.js";
import { z } from "zod";

import type { Instrument } from "./ledger";

export const leafKindSchema = z.enum([
  "COMPANY",
  "COMMODITY",
  "CRYPTO",
  "UNRESOLVED",
]);
export type LeafKind = z.infer<typeof leafKindSchema>;

export interface LeafId {
  kind: LeafKind;
  id: string;
}

export function leafKey(leaf: LeafId): string {
  return `${leaf.kind}:${leaf.id}`;
}

export interface WeightedLeaf {
  leaf: LeafId;
  name: string;
  weight: string;
}

/**
 * How an instrument decomposes. Set by hand via `pnpm exposure:map` and never
 * written by ingestion — a re-import would clobber it, exactly as it would
 * clobber quoteSymbol.
 *
 * Trade Republic maps both FUND and SYNTHETIC to "ETF", so `Instrument.type`
 * cannot tell an equity ETF from a gold ETC from a bond fund. That information
 * is not in the CSV; a human supplies it once.
 */
export const exposureKindSchema = z.enum([
  "COMPANY",
  "EQUITY_FUND",
  "BOND_FUND",
  "COMMODITY",
  "CRYPTO",
]);
export type ExposureKind = z.infer<typeof exposureKindSchema>;

export const KINDS_NEEDING_LEAF: readonly ExposureKind[] = [
  "COMMODITY",
  "CRYPTO",
];

export function resolveIntrinsic(instrument: Instrument): WeightedLeaf[] {
  const one = (kind: LeafKind, id: string): WeightedLeaf[] => [
    { leaf: { kind, id }, name: instrument.name, weight: "1" },
  ];

  const explicit = instrument.exposureKind;
  const leafId = instrument.exposureLeafId ?? instrument.id;

  if (explicit === "COMPANY") return one("COMPANY", leafId);
  if (explicit === "COMMODITY") return one("COMMODITY", leafId);
  if (explicit === "CRYPTO") return one("CRYPTO", leafId);
  if (explicit === "EQUITY_FUND" || explicit === "BOND_FUND") {
    return one("UNRESOLVED", instrument.id);
  }

  switch (instrument.type) {
    case "STOCK":
      return one("COMPANY", instrument.id);
    case "CRYPTO":
      return one("CRYPTO", instrument.id);
    case "COMMODITY":
      return one("COMMODITY", instrument.id);
    default:
      return one("UNRESOLVED", instrument.id);
  }
}

export interface FundHolding {
  identity: string;
  name: string;
  weight: string;
}

export function resolveWithHoldings(
  instrument: Instrument,
  holdings: readonly FundHolding[],
): WeightedLeaf[] {
  const intrinsic = resolveIntrinsic(instrument);
  if (instrument.exposureKind !== "EQUITY_FUND" || holdings.length === 0) {
    return intrinsic;
  }

  const leaves: WeightedLeaf[] = [];
  let covered = new Decimal(0);

  for (const holding of holdings) {
    const weight = new Decimal(holding.weight);
    if (weight.lte(0)) continue;
    covered = covered.plus(weight);
    leaves.push({
      leaf: { kind: "COMPANY", id: holding.identity },
      name: holding.name,
      weight: weight.toString(),
    });
  }

  const residual = new Decimal(1).minus(covered);
  if (!residual.isZero()) {
    leaves.push({
      leaf: { kind: "UNRESOLVED", id: instrument.id },
      name: instrument.name,
      weight: residual.toString(),
    });
  }

  return leaves.length > 0 ? leaves : intrinsic;
}

/**
 * Replace each company leaf's raw identity with its canonical one.
 *
 * Kept as its own step rather than folded into the resolvers: resolution is
 * about what an instrument contains, canonicalisation is about what two
 * containers agree to call the same thing, and keeping them apart means the
 * resolvers stay testable without a lookup table.
 *
 * Only COMPANY leaves are touched. A commodity, a crypto asset or an
 * undecomposed fund has no share class to canonicalise, and mapping them
 * through would silently merge distinct things if an id ever collided.
 *
 * A leaf with no entry keeps its raw identity, so it still appears with the
 * right value — it simply does not merge with its twin.
 */
export function canonicaliseLeaves(
  leaves: readonly WeightedLeaf[],
  canonical: ReadonlyMap<string, string>,
): WeightedLeaf[] {
  return leaves.map((weighted) => {
    if (weighted.leaf.kind !== "COMPANY") return weighted;
    const canonicalId = canonical.get(weighted.leaf.id);
    if (!canonicalId || canonicalId === weighted.leaf.id) return weighted;
    return { ...weighted, leaf: { kind: "COMPANY", id: canonicalId } };
  });
}
