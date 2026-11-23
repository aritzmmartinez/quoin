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
import type { DividendExemptionRule } from "./territory";

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

export interface DividendExemption {
  readonly rule: DividendExemptionRule;
  /** A fund or ETF: its dividends are never exempt when the rule excludes them. */
  readonly isCollective: (instrumentId: string) => boolean;
}

export interface SavingsIncomeOf {
  /** The year's income, gross in euros. */
  grossOf: NetOf;
  /** The part of it exempt as dividends, up to the year's limit. */
  exemptOf: NetOf;
  /** What enters the income pool: gross less exempt. */
  netOf: NetOf;
}

export function savingsIncomeOf(
  events: readonly LedgerEvent[],
  zone: string,
  exemption: DividendExemption | null,
): SavingsIncomeOf {
  const gross = new Map<number, Decimal>();
  const eligible = new Map<number, Decimal>();
  const add = (map: Map<number, Decimal>, year: number, amount: string) =>
    map.set(year, (map.get(year) ?? new Decimal(0)).plus(amount));

  for (const e of bookable(events)) {
    if (!isSavingsIncome(e)) continue;
    const year = fiscalYearOf(e.ts, zone);
    const amount = baseOf(e, "grossAmount").toString();
    add(gross, year, amount);
    if (exemption && e.type === "DIVIDEND" && isExemptible(e, exemption)) {
      add(eligible, year, amount);
    }
  }

  const zero = new Decimal(0);
  const grossOf: NetOf = (year) => gross.get(year) ?? zero;
  const exemptOf: NetOf = (year) =>
    exemption
      ? Decimal.min(eligible.get(year) ?? zero, exemption.rule.limit)
      : zero;
  return { grossOf, exemptOf, netOf: (year) => grossOf(year).minus(exemptOf(year)) };
}

function isExemptible(e: DividendEvent, { rule, isCollective }: DividendExemption) {
  return !(rule.excludesCollectiveInvestment && isCollective(e.instrumentId));
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
