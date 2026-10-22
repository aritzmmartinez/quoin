import Decimal from "decimal.js";

import { toIsoDate, type CalendarDate } from "../calendar";
import { Money } from "../domain";

/** Spanish IRPF territories only (foral and común) — not a multi-country abstraction. */
export type Territory = "bizkaia";

export type RepurchaseAssetClass = "listed-security" | "fungible-crypto";

/**
 * Art. 43 NF 13/2013 de Bizkaia — pérdidas patrimoniales no computables por
 * recompra. Each letter is one entry over one engine (wash-sale.ts,
 * deferred-loss.ts); the letters differ in the assets they cover, the window
 * either side of the transmission, what counts as the same asset and the
 * transmissions they govern, never in how a deferred loss is carried or
 * integrated.
 *
 * - `homogeneity: "instrument"` is the same instrument id. For crypto that is
 *   the same asset at any broker, because every adapter takes a crypto
 *   instrument's id from its asset code (`cryptoInstrumentId`).
 * - `acquisitions` says which purchases in the window count: "all" reads
 *   "hubiera adquirido" literally, so units received in kind (a reward, a
 *   saveback) are an acquisition; "cash-only" leaves them out of the window
 *   and out of the recipients of the deferral.
 * - `from` / `to` are Madrid calendar days of the transmission, inclusive. The
 *   transmission decides: a purchase before `from` still counts as the
 *   repurchase of a sale on or after it.
 *
 * A sale no entry covers is assessed by nothing, and its loss computes whole.
 */
export interface RepurchaseRule {
  territory: Territory;
  letter: string;
  assetClass: RepurchaseAssetClass;
  windowMonths: number;
  homogeneity: "instrument";
  acquisitions: "all" | "cash-only";
  from: string | null;
  to: string | null;
  source: string;
}

export const REPURCHASE_RULES: readonly RepurchaseRule[] = [
  {
    territory: "bizkaia",
    letter: "g",
    assetClass: "listed-security",
    windowMonths: 2,
    homogeneity: "instrument",
    acquisitions: "all",
    from: null,
    to: null,
    source: "Art. 43.g NF 13/2013 de Bizkaia",
  },
];

export function repurchaseRuleFor(
  territory: Territory,
  assetClass: RepurchaseAssetClass,
  saleDay: CalendarDate,
  rules: readonly RepurchaseRule[] = REPURCHASE_RULES,
): RepurchaseRule | null {
  const day = toIsoDate(saleDay);
  return (
    rules.find(
      (rule) =>
        rule.territory === territory &&
        rule.assetClass === assetClass &&
        (rule.from === null || rule.from <= day) &&
        (rule.to === null || day <= rule.to),
    ) ?? null
  );
}

/**
 * How far after a crypto loss sale a new acquisition of the same asset is
 * pointed out. Informative only: crypto is outside the two-month rule, and
 * whether a one-year repurchase rule reaches it is unsettled.
 */
export const UNLISTED_NOTICE_WINDOW_MONTHS = 12;
/**
 * The zone every fiscal date is read in. Bizkaia files on Madrid's calendar, so a
 * trade at 23:30Z on 31 December belongs to the next day — and the next year.
 */
export const FISCAL_TIME_ZONE = "Europe/Madrid";
/** Art. 66 NF 13/2013 de Bizkaia — integración y compensación de rentas en la base imponible del ahorro (límite de cuatro años). */
export const LOSS_CARRYFORWARD_YEARS = 4;

export interface TaxBracket {
  from: string;
  to: string | null;
  rate: string;
}

export interface SavingsBaseTaxScale {
  territory: Territory;
  year: number;
  source: string;
  brackets: TaxBracket[];
}

export const TAX_SCALES: readonly SavingsBaseTaxScale[] = [
  {
    territory: "bizkaia",
    year: 2026,
    source:
      "Art. 76 NF 13/2013 de Bizkaia, redacción NF 2/2025, efectos 1-1-2026",
    brackets: [
      { from: "0", to: "7500", rate: "0.19" },
      { from: "7500", to: "15000", rate: "0.20" },
      { from: "15000", to: "30000", rate: "0.22" },
      { from: "30000", to: "50000", rate: "0.24" },
      { from: "50000", to: "90000", rate: "0.255" },
      { from: "90000", to: "120000", rate: "0.26" },
      { from: "120000", to: "240000", rate: "0.265" },
      { from: "240000", to: "300000", rate: "0.27" },
      { from: "300000", to: null, rate: "0.28" },
    ],
  },
];

export function getTaxScale(
  territory: Territory,
  year: number,
): SavingsBaseTaxScale | null {
  return (
    TAX_SCALES.find((s) => s.territory === territory && s.year === year) ?? null
  );
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
