import Decimal from "decimal.js";

import type { LedgerEvent } from "../domain";

import { LOSS_CARRYFORWARD_YEARS } from "./config";
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
 * Nothing here is stored. Every call recomputes targetYear-4..targetYear
 * straight from the ledger, over the same single pass `taxYearOf` reads. A
 * year's own net is its computable net: the deferred losses that compute in it
 * are already inside, so a year that ends negative because of one starts that
 * loss's four years in that year, not in the year of the sale that deferred it.
 *
 * Pending losses are consumed oldest-first, per the legal ordering, and a
 * loss can offset any year up to LOSS_CARRYFORWARD_YEARS after the one it
 * originated in; restricting the window to [targetYear - 4, targetYear]
 * enforces that expiry without tracking it separately.
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

  for (let y = year - LOSS_CARRYFORWARD_YEARS; y <= year; y++) {
    const ownNet = new Decimal(taxYearOf(history, y).computableNet);
    let consumed = new Decimal(0);
    let finalNet = ownNet;

    if (ownNet.isNegative()) {
      pending.push({ year: y, remaining: ownNet.abs() });
    } else if (ownNet.isPositive()) {
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
