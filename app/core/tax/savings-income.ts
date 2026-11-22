import Decimal from "decimal.js";

import { fiscalYearOf } from "../calendar";
import {
  isInKind,
  type DividendEvent,
  type InterestEvent,
  type LedgerEvent,
} from "../domain";
import { baseOf, bookable } from "../fx";

import type { NetOf } from "./carryforward";

/**
 * Income from movable capital in the savings base: interest and dividends paid
 * in cash, gross. A dividend received in kind (a reward, a saveback) stays out:
 * its classification is pending.
 */
export function isSavingsIncome(
  event: LedgerEvent,
): event is DividendEvent | InterestEvent {
  return (
    event.type === "INTEREST" || (event.type === "DIVIDEND" && !isInKind(event))
  );
}

function inYear(events: readonly LedgerEvent[], year: number, zone: string) {
  return bookable(events).filter((e) => fiscalYearOf(e.ts, zone) === year);
}

export function savingsIncomeNetOf(
  events: readonly LedgerEvent[],
  zone: string,
): NetOf {
  const byYear = new Map<number, Decimal>();
  for (const e of bookable(events)) {
    if (!isSavingsIncome(e)) continue;
    const year = fiscalYearOf(e.ts, zone);
    byYear.set(
      year,
      (byYear.get(year) ?? new Decimal(0)).plus(
        baseOf(e, "grossAmount").toString(),
      ),
    );
  }
  return (year) => byYear.get(year) ?? new Decimal(0);
}

export interface Withholdings {
  /** The withholdings recorded on the year's savings income, in euros: payments on account of the whole IRPF, never subtracted from the savings quota. In-kind income shows its own. */
  total: string;
  /** Some interest of the year records no withholding: rows imported before interest carried it say 0. Only for a notice. */
  interestWithoutWithholding: boolean;
}

export function withholdingsOf(
  events: readonly LedgerEvent[],
  year: number,
  zone: string,
): Withholdings {
  const withheld = inYear(events, year, zone).filter(isSavingsIncome);
  return {
    total: withheld
      .reduce(
        (sum, e) => sum.plus(baseOf(e, "taxWithheld").toString()),
        new Decimal(0),
      )
      .toFixed(2),
    interestWithoutWithholding: withheld.some(
      (e) => e.type === "INTEREST" && new Decimal(e.taxWithheld).isZero(),
    ),
  };
}

export function savingsIncomeCountOf(
  events: readonly LedgerEvent[],
  year: number,
  zone: string,
): number {
  return inYear(events, year, zone).filter(isSavingsIncome).length;
}
