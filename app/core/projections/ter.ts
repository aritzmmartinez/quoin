import Decimal from "decimal.js";

import { Money } from "../domain";

/**
 * One held line for the weighted TER: what it is worth today and, if anyone has
 * written it down, what it charges a year.
 */
export interface TerLine {
  instrumentId: string;
  value: string;
  ter?: string | null;
}

export interface WeightedTerResult {
  /** Value-weighted annual fee, as a fraction. "0" when nothing is covered. */
  weightedTer: string;
  /** Annual cost in euros: `weightedTer` applied to the covered value. */
  annualCost: string;
  coveredValue: string;
  totalValue: string;
  /** Share of `totalValue` that has a TER on file, as a fraction. */
  coverage: string;
  unknownInstrumentIds: string[];
}

/**
 * Value-weighted TER over the positions that have one.
 *
 * Weighted by **current market value** — "what you pay today", not what the plan
 * would pay once it is met. Positions without a TER on file are excluded from
 * the weighted average and reported by id, never assumed to be free: a fund
 * treated as 0% flatters the figure by exactly the amount nobody has measured.
 * Same rule as `unpricedCount` and an `UNRESOLVED` leaf — reported, not spread.
 */
export function computeWeightedTer(
  lines: readonly TerLine[],
): WeightedTerResult {
  let totalValue = Money.zero();
  let coveredValue = Money.zero();
  let weighted = new Decimal(0);
  const unknownInstrumentIds: string[] = [];

  for (const line of lines) {
    const value = Money.fromString(line.value);
    if (value.isNegative()) {
      throw new Error(`Negative held value for ${line.instrumentId}.`);
    }
    if (value.isZero()) continue;

    totalValue = totalValue.add(value);

    if (line.ter == null || line.ter === "") {
      unknownInstrumentIds.push(line.instrumentId);
      continue;
    }

    const ter = new Decimal(line.ter);
    if (!ter.isFinite() || ter.isNegative()) {
      throw new Error(`Not an annual fee for ${line.instrumentId}: ${line.ter}`);
    }

    coveredValue = coveredValue.add(value);
    weighted = weighted.plus(ter.times(value.toString()));
  }

  const covered = new Decimal(coveredValue.toString());
  const total = new Decimal(totalValue.toString());

  return {
    weightedTer: covered.gt(0) ? weighted.div(covered).toFixed(6) : "0",
    annualCost: covered.gt(0)
      ? Money.fromString(weighted.toFixed(2)).toString()
      : "0",
    coveredValue: coveredValue.toString(),
    totalValue: totalValue.toString(),
    coverage: total.gt(0) ? covered.div(total).toFixed(6) : "0",
    unknownInstrumentIds: unknownInstrumentIds.sort(),
  };
}
