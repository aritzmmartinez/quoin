import Decimal from "decimal.js";

import { toIsoDate, zoneOfResidence, type CalendarDate } from "../calendar";
import { Money, type Residence } from "../domain";

import { territoryRules } from "./territory";

/** Spanish IRPF territories only (foral and común) — not a multi-country abstraction. */
export type Territory = "bizkaia" | "comun";

const TERRITORIES: Record<Residence, Territory> = {
  bizkaia: "bizkaia",
};

export function territoryOfResidence(residence: Residence): Territory {
  return TERRITORIES[residence];
}

/** The territory whose rules apply, and the zone its calendar is read in. */
export interface Jurisdiction {
  territory: Territory;
  zone: string;
}

export function jurisdictionOf(residence: Residence): Jurisdiction {
  return {
    territory: territoryOfResidence(residence),
    zone: zoneOfResidence(residence),
  };
}

export type RepurchaseAssetClass =
  | "listed-security"
  | "fungible-crypto"
  | "unclassified";

/**
 * Pérdidas patrimoniales no computables por recompra. Each rule is one entry
 * over one engine (wash-sale.ts, deferred-loss.ts); rules differ in the assets
 * they cover, the window either side of the transmission, what counts as the
 * same asset and the transmissions they govern, never in how a deferred loss
 * is carried or integrated. A territory's rules live in `territoryRules`.
 *
 * - `homogeneity: "instrument"` is the same instrument id. For crypto that is
 *   the same asset at any broker, because every adapter takes a crypto
 *   instrument's id from its asset code (`cryptoInstrumentId`).
 * - `acquisitions` says which purchases in the window count: "all" reads
 *   "hubiera adquirido" literally, so units received in kind (a reward, a
 *   saveback) are an acquisition; "cash-only" leaves them out of the window
 *   and out of the recipients of the deferral.
 * - `from` / `to` are calendar days of the transmission in the residence's
 *   zone, inclusive. The transmission decides: a purchase before `from` still
 *   counts as the repurchase of a sale on or after it.
 *
 * A sale no entry covers is assessed by nothing, and its loss computes whole.
 * No entry covers "unclassified": a bond held directly yields income from
 * movable capital, outside the repurchase rule, and a commodity held directly
 * would fall under a letter that is not modelled, so the app names such a sale
 * instead.
 */
export interface RepurchaseRule {
  assetClass: RepurchaseAssetClass;
  windowMonths: number;
  homogeneity: "instrument";
  acquisitions: "all" | "cash-only";
  from: string | null;
  to: string | null;
  source: string;
}

export function repurchaseRuleFor(
  territory: Territory,
  assetClass: RepurchaseAssetClass,
  saleDay: CalendarDate,
  rules: readonly RepurchaseRule[] = territoryRules(territory).repurchase,
): RepurchaseRule | null {
  const day = toIsoDate(saleDay);
  return (
    rules.find(
      (rule) =>
        rule.assetClass === assetClass &&
        (rule.from === null || rule.from <= day) &&
        (rule.to === null || day <= rule.to),
    ) ?? null
  );
}

/**
 * How the two legs of a swap are valued for tax, as data like a repurchase
 * rule. `from` / `to` are calendar days of the swap in the residence's zone,
 * inclusive; null is open, which is what applies while no start date is
 * settled. No entry in force leaves each leg at its own market value.
 */
export interface SwapValuationRule {
  from: string | null;
  to: string | null;
  source: string;
}

export function swapValuationRuleFor(
  territory: Territory,
  swapDay: string,
  rules: readonly SwapValuationRule[] = territoryRules(territory).swapValuation,
): SwapValuationRule | null {
  return (
    rules.find(
      (rule) =>
        (rule.from === null || rule.from <= swapDay) &&
        (rule.to === null || swapDay <= rule.to),
    ) ?? null
  );
}

export interface TaxBracket {
  from: string;
  to: string | null;
  rate: string;
}

export interface SavingsBaseTaxScale {
  year: number;
  source: string;
  brackets: TaxBracket[];
}

export function getTaxScale(
  territory: Territory,
  year: number,
): SavingsBaseTaxScale | null {
  let inForce: SavingsBaseTaxScale | null = null;
  for (const scale of territoryRules(territory).savingsScales) {
    if (scale.year <= year && (inForce === null || scale.year > inForce.year))
      inForce = scale;
  }
  return inForce;
}


export function computeSavingsQuota(
  netBase: Money,
  scale: SavingsBaseTaxScale,
): Money {
  if (!netBase.isPositive()) return Money.zero();

  const base = new Decimal(netBase.toString());
  let quota = Money.zero();

  for (const bracket of scale.brackets) {
    const from = new Decimal(bracket.from);
    if (base.lte(from)) break;

    const to =
      bracket.to === null ? base : Decimal.min(new Decimal(bracket.to), base);
    const taxable = to.minus(from);
    if (taxable.lte(0)) continue;

    quota = quota.add(
      Money.fromString(taxable.toFixed()).scaleBy(bracket.rate),
    );
  }

  return quota;
}
