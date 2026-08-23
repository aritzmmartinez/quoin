import Decimal from "decimal.js";

import {
  deriveTargetWeights,
  type Instrument,
  type PortfolioTarget,
} from "~/core/domain";
import {
  toMonthlyReturns,
  type ProjectionHeldLine,
  type ProjectionPricePoint,
  type ProjectionResult,
  type ProjectionSourceLine,
} from "~/core/projections";

export const HORIZON_PARAM = "anos";
export const GOAL_PARAM = "objetivo";
export const DETAIL_PARAM = "detalle";

export const DEFAULT_HORIZON_YEARS = 10;
export const MAX_HORIZON_YEARS = 40;

export const MIN_WINDOW_MONTHS = 60;

export function parseHorizonYears(params: URLSearchParams): number {
  const raw = params.get(HORIZON_PARAM);
  if (raw === null || raw.trim() === "") return DEFAULT_HORIZON_YEARS;

  const parsed = Number(raw.replace(",", "."));
  if (!Number.isFinite(parsed)) return DEFAULT_HORIZON_YEARS;

  const years = Math.round(parsed);
  if (years < 1) return 1;
  if (years > MAX_HORIZON_YEARS) return MAX_HORIZON_YEARS;
  return years;
}

export function parseExtended(params: URLSearchParams): boolean {
  return params.get(DETAIL_PARAM) === "1";
}

export function parseGoal(params: URLSearchParams): string | null {
  const raw = params.get(GOAL_PARAM);
  if (raw === null || raw.trim() === "") return null;

  let parsed: Decimal;
  try {
    parsed = new Decimal(raw.replace(",", "."));
  } catch {
    return null;
  }
  if (!parsed.isFinite() || !parsed.gt(0)) return null;
  return parsed.toFixed(2);
}

export interface GoalAnswer {
  amount: string;
  monthlyContribution: string | null;
  horizonMonths: number | null;
}

export interface NamedValue {
  instrumentId: string;
  name: string;
  value: string;
}

export interface ProjectionView {
  horizonYears: number;
  contribution: string;
  goal: string | null;
  extended: boolean;
  result: ProjectionResult | null;
  problem: "no-target" | "no-history" | "no-window" | "thin-window" | null;
  windowMonths: number;
  limitingName: string;
  excluded: ExcludedLine[];
  coverage: string;
  unsimulated: NamedValue[];
  unpricedCount: number;
  annualInflation: string | null;
  goalAnswer: GoalAnswer | null;
}

export interface ExcludedLine {
  instrumentId: string;
  name: string;
  weight: string;
}

export type OffPlanState = "simulated" | "all-excluded" | "none";

export function offPlanState(
  result: Pick<ProjectionResult, "offPlanValue" | "unsimulatedInstrumentIds">,
): OffPlanState {
  if (new Decimal(result.offPlanValue).gt(0)) return "simulated";
  return result.unsimulatedInstrumentIds.length > 0 ? "all-excluded" : "none";
}

export interface ProjectionSource {
  lines: ProjectionSourceLine[];
  heldLines: ProjectionHeldLine[];
  excluded: ExcludedLine[];
  coverage: string;
}

export function buildProjectionSource(
  target: PortfolioTarget,
  histories: ReadonlyMap<string, readonly ProjectionPricePoint[]>,
  instruments: ReadonlyMap<string, Instrument>,
  offPlanValues: ReadonlyMap<string, string>,
  asOf: Date,
): ProjectionSource {
  const lines: ProjectionSourceLine[] = [];
  const excluded: ExcludedLine[] = [];
  let covered = new Decimal(0);

  for (const allocation of deriveTargetWeights(target)) {
    const weight = new Decimal(allocation.weight);
    if (!weight.gt(0)) continue;

    const monthlyReturns = toMonthlyReturns(
      histories.get(allocation.instrumentId) ?? [],
      asOf,
    );

    if (monthlyReturns.length === 0) {
      excluded.push({
        instrumentId: allocation.instrumentId,
        name:
          instruments.get(allocation.instrumentId)?.name ??
          allocation.instrumentId,
        weight: allocation.weight,
      });
      continue;
    }

    covered = covered.plus(weight);
    lines.push({
      instrumentId: allocation.instrumentId,
      targetWeight: allocation.weight,
      monthlyReturns,
      ter: instruments.get(allocation.instrumentId)?.ter ?? null,
    });
  }

  const heldLines: ProjectionHeldLine[] = [];
  for (const [instrumentId, value] of offPlanValues) {
    if (!new Decimal(value).gt(0)) continue;
    heldLines.push({
      instrumentId,
      value,
      monthlyReturns: toMonthlyReturns(histories.get(instrumentId) ?? [], asOf),
      ter: instruments.get(instrumentId)?.ter ?? null,
    });
  }

  return { lines, heldLines, excluded, coverage: covered.toFixed(6) };
}
