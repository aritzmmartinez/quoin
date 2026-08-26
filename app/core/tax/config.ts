import Decimal from "decimal.js";

import { Money } from "../domain";

/** Spanish IRPF territories only (foral and común) — not a multi-country abstraction. */
export type Territory = "bizkaia";

/** Art. 47.2 NF 13/2013 de Bizkaia — recompra de valores homogéneos. */
export const WASH_SALE_WINDOW_MONTHS = 2;
/** Art. 71 NF 13/2013 de Bizkaia — compensación de saldos negativos. */
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
