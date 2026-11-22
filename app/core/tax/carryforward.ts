import Decimal from "decimal.js";

import type { LedgerEvent } from "../domain";

import { territoryRules } from "./territory";
import {
  computeTaxHistory,
  taxYearOf,
  type TaxHistory,
  type TaxOptions,
} from "./tax-lots";

export interface CarryforwardStep {
  year: number;
  ownNet: string;
  consumedFromCarryforward: string;
  finalNet: string;
  pendingLossRemaining: string;
}

export interface CarryforwardResult {
  targetYear: number;
  steps: CarryforwardStep[];
  netSavingsBase: string;
}

/**
 * Nothing here is stored. Every call recomputes targetYear-years..targetYear
 * straight from the ledger, over the same single pass `taxYearOf` reads. A
 * year's own net is its computable net: the deferred losses that compute in it
 * are already inside, so a year that ends negative because of one starts that
 * loss's window in that year, not in the year of the sale that deferred it.
 *
 * Pending losses are consumed oldest-first, per the legal ordering, and a
 * loss can offset any year up to the territory's `lossCarryforwardYears`
 * after the one it originated in; restricting the window to
 * [targetYear - years, targetYear] enforces that expiry without tracking it
 * separately.
 */
export function computeNetWithCarryforward(
  events: readonly LedgerEvent[],
  year: number,
  options: TaxOptions,
): CarryforwardResult {
  return carryforwardFrom(computeTaxHistory(events, options), year);
}

export function carryforwardFrom(
  history: TaxHistory,
  year: number,
): CarryforwardResult {
  const pending: { year: number; remaining: Decimal }[] = [];
  const steps: CarryforwardStep[] = [];

  const { lossCarryforwardYears } = territoryRules(history.territory);
  for (let y = year - lossCarryforwardYears; y <= year; y++) {
    const ownNet = new Decimal(taxYearOf(history, y).computableNet);
    let consumed = new Decimal(0);
    let finalNet = ownNet;

    if (ownNet.lt(0)) {
      pending.push({ year: y, remaining: ownNet.abs() });
    } else if (ownNet.gt(0)) {
      let remaining = ownNet;
      for (const loss of pending) {
        if (remaining.lte(0)) break;
        if (loss.remaining.lte(0)) continue;
        const applied = Decimal.min(loss.remaining, remaining);
        loss.remaining = loss.remaining.minus(applied);
        remaining = remaining.minus(applied);
        consumed = consumed.plus(applied);
      }
      finalNet = ownNet.minus(consumed);
    }

    steps.push({
      year: y,
      ownNet: ownNet.toFixed(),
      consumedFromCarryforward: consumed.toFixed(),
      finalNet: finalNet.toFixed(),
      pendingLossRemaining: pending
        .reduce((sum, loss) => sum.plus(loss.remaining), new Decimal(0))
        .toFixed(),
    });
  }

  return {
    targetYear: year,
    steps,
    netSavingsBase: steps[steps.length - 1]!.finalNet,
  };
}
