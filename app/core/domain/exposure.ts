import Decimal from "decimal.js";
import { z } from "zod";

import type { Instrument } from "./ledger";

/**
 * What kind of thing a position ultimately resolves to. A leaf is not
 * necessarily a company: gold resolves to a commodity, BTC to a crypto asset,
 * and neither has constituents. Making the kind explicit is what stops those
 * from being special cases.
 */
export const leafKindSchema = z.enum([
  "COMPANY",
  "COMMODITY",
  "CRYPTO",
  "UNRESOLVED",
]);
export type LeafKind = z.infer<typeof leafKindSchema>;

export interface LeafId {
  kind: LeafKind;
  /** ISIN for a company, "XAU" for gold, "BTC" for bitcoin. */
  id: string;
}

/** Stable map key. Two leaves are the same leaf iff kind and id match. */
export function leafKey(leaf: LeafId): string {
  return `${leaf.kind}:${leaf.id}`;
}

export interface WeightedLeaf {
  leaf: LeafId;
  name: string;
  /** Fraction of the parent position, as a decimal string. Weights sum to 1. */
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

/** Kinds that need an explicit leaf id (gold is XAU, not its ISIN). */
export const KINDS_NEEDING_LEAF: readonly ExposureKind[] = ["COMMODITY", "CRYPTO"];

/**
 * Resolve an instrument to its leaves using only what is known intrinsically —
 * no issuer holdings involved.
 *
 * A fund with no holdings data resolves to a single UNRESOLVED leaf carrying its
 * own value. It is never spread across the leaves we do know: reporting "12%
 * undecomposed" is information, whereas pro-rating it would invent a
 * concentration that isn't there. Same rule as unpricedCount — what we cannot
 * account for gets reported, not distributed.
 */
export function resolveIntrinsic(instrument: Instrument): WeightedLeaf[] {
  const one = (kind: LeafKind, id: string): WeightedLeaf[] => [
    { leaf: { kind, id }, name: instrument.name, weight: "1" },
  ];

  const explicit = instrument.exposureKind;
  const leafId = instrument.exposureLeafId ?? instrument.id;

  if (explicit === "COMPANY") return one("COMPANY", leafId);
  if (explicit === "COMMODITY") return one("COMMODITY", leafId);
  if (explicit === "CRYPTO") return one("CRYPTO", leafId);
  // Equity funds decompose only once issuer holdings exist; bond funds have no
  // source at all. Both are honestly unresolved today.
  if (explicit === "EQUITY_FUND" || explicit === "BOND_FUND") {
    return one("UNRESOLVED", instrument.id);
  }

  // No explicit mapping: fall back to the instrument type. The defaults cover
  // the cases TR reports unambiguously, so only funds and ETCs need mapping.
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

/** A fund constituent, as published by its issuer. */
export interface FundHolding {
  /** ISIN when the issuer publishes one, otherwise its ticker. */
  identity: string;
  name: string;
  /** Fraction of the fund, as a decimal string. */
  weight: string;
}

/**
 * Resolve an instrument to its leaves, using issuer holdings when we have them.
 *
 * This is the only thing that changes when look-through arrives: `computeExposures`
 * already takes `WeightedLeaf[]`, so a fund going from one leaf to nine hundred is
 * not a new shape, just a longer array. That was the point of the seam.
 *
 * The rule that applies outside a fund applies inside one too: whatever the file
 * does not account for — cash, derivatives, rounding, an issuer's own catch-all
 * bucket — becomes an UNRESOLVED leaf of the fund's own id. A fund published with
 * only its top ten resolves to eleven leaves, ten companies and a large unknown,
 * which is honest and still useful. Never pro-rated.
 */
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
      // A ticker cannot collide with an ISIN by shape, so both live in the same
      // COMPANY namespace. They stay separate leaves until a human aliases them:
      // "NVDA" and "US67066G1040" are the same company, and no parser knows that.
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
