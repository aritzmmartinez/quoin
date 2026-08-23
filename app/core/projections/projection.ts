import Decimal from "decimal.js";

import { Money, periodOf, type Period } from "../domain";

export interface ProjectionPricePoint {
  asOf: Date;
  price: string;
}

export interface MonthlyReturn {
  period: Period;
  change: number;
}

export interface ProjectionSourceLine {
  instrumentId: string;
  targetWeight: string;
  monthlyReturns: readonly MonthlyReturn[];
  ter?: string | null;
}

export interface ProjectionHeldLine {
  instrumentId: string;
  value: string;
  monthlyReturns: readonly MonthlyReturn[];
  ter?: string | null;
}

export interface ProjectionInput {
  horizonMonths: number;
  monthlyContribution: string;
  plannedValue?: string;
  lines: readonly ProjectionSourceLine[];
  heldLines?: readonly ProjectionHeldLine[];
  monthlyInflation?: string | null;
  simulations?: number;
  seed?: number;
  terCost?: boolean;
}

export interface TerCostResult {
  p10: string;
  p50: string;
  p90: string;
  unknownInstrumentIds: string[];
}

export interface ProjectionResult {
  p10: string;
  p25: string;
  p50: string;
  p75: string;
  p90: string;
  p10Real: string | null;
  p25Real: string | null;
  p50Real: string | null;
  p75Real: string | null;
  p90Real: string | null;
  contributed: string;
  offPlanValue: string;
  unsimulatedValue: string;
  unsimulatedInstrumentIds: string[];
  impliedAnnualReturn: string;
  windowMonths: number;
  limitingInstrumentId: string;
  simulations: number;
  seed: number;
  terCost: TerCostResult | null;
}

export const DEFAULT_SIMULATIONS = 10000;
export const DEFAULT_SEED = 0x51554f49;
export const MAX_HORIZON_MONTHS = 1200;
const MONTHS_PER_YEAR = 12;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function previousPeriod(period: Period): Period {
  const [year, month] = period.split("-");
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m)) {
    throw new Error(`Not a period: "${period}"`);
  }
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function toMonthlyReturns(
  points: readonly ProjectionPricePoint[],
  asOf: Date,
): MonthlyReturn[] {
  const closes = new Map<Period, { ts: number; price: Decimal }>();
  for (const point of points) {
    const period = periodOf(point.asOf);
    const ts = point.asOf.getTime();
    const held = closes.get(period);
    if (held === undefined || ts >= held.ts) {
      closes.set(period, { ts, price: new Decimal(point.price) });
    }
  }

  const current = periodOf(asOf);
  const returns: MonthlyReturn[] = [];
  for (const period of [...closes.keys()].sort()) {
    if (period >= current) continue;
    const close = closes.get(period);
    const previous = closes.get(previousPeriod(period));
    if (close === undefined || previous === undefined) continue;
    if (!previous.price.gt(0)) continue;
    returns.push({
      period,
      change: close.price.div(previous.price).minus(1).toNumber(),
    });
  }
  return returns;
}

export interface ProjectionWindow {
  periods: Period[];
  windowMonths: number;
  limitingInstrumentId: string;
}

export function projectionWindow(
  lines: readonly ProjectionSourceLine[],
): ProjectionWindow {
  if (lines.length === 0) {
    return { periods: [], windowMonths: 0, limitingInstrumentId: "" };
  }

  const counts = new Map<Period, number>();
  for (const line of lines) {
    for (const { period } of line.monthlyReturns) {
      counts.set(period, (counts.get(period) ?? 0) + 1);
    }
  }

  const periods = [...counts.entries()]
    .filter(([, seen]) => seen === lines.length)
    .map(([period]) => period)
    .sort();

  const limiting = lines.reduce((worst, line) => {
    const a = bounds(line.monthlyReturns);
    const b = bounds(worst.monthlyReturns);
    if (a.first !== b.first) return a.first > b.first ? line : worst;
    if (a.last !== b.last) return a.last < b.last ? line : worst;
    return a.count < b.count ? line : worst;
  });

  return {
    periods,
    windowMonths: periods.length,
    limitingInstrumentId: limiting.instrumentId,
  };
}

function bounds(monthlyReturns: readonly MonthlyReturn[]): {
  first: string;
  last: string;
  count: number;
} {
  const periods = monthlyReturns.map((r) => r.period);
  return {
    first:
      periods.length === 0
        ? "9999-99"
        : periods.reduce((a, b) => (a < b ? a : b)),
    last:
      periods.length === 0
        ? "0000-00"
        : periods.reduce((a, b) => (a > b ? a : b)),
    count: periods.length,
  };
}

function weightsOf(lines: readonly ProjectionSourceLine[]): number[] {
  const raw = lines.map((line) => {
    const weight = new Decimal(line.targetWeight);
    if (weight.isNegative()) {
      throw new Error(`Negative target weight for ${line.instrumentId}.`);
    }
    return weight;
  });
  const total = raw.reduce((sum, weight) => sum.plus(weight), new Decimal(0));
  if (!total.gt(0)) {
    throw new Error("A plan whose weights sum to zero projects nothing.");
  }
  return raw.map((weight) => weight.div(total).toNumber());
}

function blend(
  periods: readonly Period[],
  monthlyReturns: readonly (readonly MonthlyReturn[])[],
  weights: readonly number[],
): number[] {
  const byPeriod = monthlyReturns.map(
    (returns) => new Map(returns.map((r) => [r.period, r.change])),
  );
  return periods.map((period) =>
    byPeriod.reduce(
      (sum, changes, index) =>
        sum + (weights[index] ?? 0) * (changes.get(period) ?? 0),
      0,
    ),
  );
}

interface FeeBearing {
  instrumentId: string;
  monthlyReturns: readonly MonthlyReturn[];
  ter?: string | null;
}

function grossSeries(line: FeeBearing): readonly MonthlyReturn[] {
  if (line.ter == null || line.ter === "") return line.monthlyReturns;

  const ter = new Decimal(line.ter);
  if (!ter.isFinite() || ter.isNegative()) {
    throw new Error(`Not an annual fee for ${line.instrumentId}: ${line.ter}`);
  }
  if (ter.isZero()) return line.monthlyReturns;

  const monthly = ter.plus(1).pow(new Decimal(1).div(MONTHS_PER_YEAR));
  return line.monthlyReturns.map(({ period, change }) => ({
    period,
    change: monthly
      .times(change + 1)
      .minus(1)
      .toNumber(),
  }));
}

interface OffPlan {
  series: number[];
  covering: ProjectionHeldLine[];
  weights: number[];
  value: Money;
  unsimulatedValue: Money;
  unsimulatedInstrumentIds: string[];
}

function offPlanPot(
  heldLines: readonly ProjectionHeldLine[],
  periods: readonly Period[],
): OffPlan {
  const covering: ProjectionHeldLine[] = [];
  const unsimulatedInstrumentIds: string[] = [];
  let unsimulatedValue = Money.zero();

  for (const line of heldLines) {
    const value = Money.fromString(line.value);
    if (value.isNegative()) {
      throw new Error(`Negative held value for ${line.instrumentId}.`);
    }
    const has = new Set(line.monthlyReturns.map((r) => r.period));
    if (periods.every((period) => has.has(period))) covering.push(line);
    else {
      unsimulatedInstrumentIds.push(line.instrumentId);
      unsimulatedValue = unsimulatedValue.add(value);
    }
  }

  const value = covering.reduce(
    (sum, line) => sum.add(Money.fromString(line.value)),
    Money.zero(),
  );

  const weights = value.isZero()
    ? covering.map(() => 0)
    : covering.map((line) =>
        new Decimal(line.value).div(new Decimal(value.toString())).toNumber(),
      );

  return {
    series: blend(
      periods,
      covering.map((line) => line.monthlyReturns),
      weights,
    ),
    covering,
    weights,
    value,
    unsimulatedValue,
    unsimulatedInstrumentIds,
  };
}

export function startingValue(
  input: Pick<ProjectionInput, "plannedValue" | "lines" | "heldLines">,
): string {
  const { periods } = projectionWindow(input.lines);
  return Money.fromString(input.plannedValue ?? "0")
    .add(offPlanPot(input.heldLines ?? [], periods).value)
    .toString();
}

export function computeProjection(input: ProjectionInput): ProjectionResult {
  const {
    horizonMonths,
    simulations = DEFAULT_SIMULATIONS,
    seed = DEFAULT_SEED,
    lines,
    heldLines = [],
  } = input;

  if (!Number.isInteger(horizonMonths) || horizonMonths < 1) {
    throw new Error(
      `A projection horizon is a whole number of months, at least 1; got ${horizonMonths}.`,
    );
  }
  if (horizonMonths > MAX_HORIZON_MONTHS) {
    throw new Error(
      `A horizon over ${MAX_HORIZON_MONTHS} months is not a forecast.`,
    );
  }
  if (!Number.isInteger(simulations) || simulations < 1) {
    throw new Error("A projection needs at least one simulation.");
  }
  if (lines.length === 0) {
    throw new Error("A projection needs at least one planned instrument.");
  }

  const contribution = Money.fromString(input.monthlyContribution);
  if (contribution.isNegative()) {
    throw new Error("A monthly contribution cannot be negative.");
  }
  const planned = Money.fromString(input.plannedValue ?? "0");
  if (planned.isNegative()) {
    throw new Error("A starting value cannot be negative.");
  }

  const { periods, windowMonths, limitingInstrumentId } =
    projectionWindow(lines);
  if (windowMonths === 0) {
    throw new Error(
      "The planned instruments share no month of price history, so there is nothing to resample.",
    );
  }

  const planWeights = weightsOf(lines);
  const planSeries = blend(
    periods,
    lines.map((line) => line.monthlyReturns),
    planWeights,
  );
  const offPlan = offPlanPot(heldLines, periods);

  const feeLines: FeeBearing[] = [...lines, ...offPlan.covering];
  const gross =
    input.terCost === true && feeLines.some((line) => line.ter != null)
      ? {
          plan: blend(periods, lines.map(grossSeries), planWeights),
          offPlan: blend(
            periods,
            offPlan.covering.map(grossSeries),
            offPlan.weights,
          ),
          unknownInstrumentIds: feeLines
            .filter((line) => line.ter == null || line.ter === "")
            .map((line) => line.instrumentId)
            .sort(),
        }
      : null;

  const { finals, costs } = simulate(
    planSeries,
    offPlan.series,
    gross,
    horizonMonths,
    planned.toNumber(),
    offPlan.value.toNumber(),
    contribution.toNumber(),
    simulations,
    seed,
  );

  const p10 = toMoney(percentile(finals, 0.1));
  const p25 = toMoney(percentile(finals, 0.25));
  const p50 = toMoney(percentile(finals, 0.5));
  const p75 = toMoney(percentile(finals, 0.75));
  const p90 = toMoney(percentile(finals, 0.9));
  const factor = deflator(input.monthlyInflation, horizonMonths);
  const real = (value: Money): string | null =>
    factor === null ? null : value.divideBy(factor).toString();

  return {
    p10: p10.toString(),
    p25: p25.toString(),
    p50: p50.toString(),
    p75: p75.toString(),
    p90: p90.toString(),
    p10Real: real(p10),
    p25Real: real(p25),
    p50Real: real(p50),
    p75Real: real(p75),
    p90Real: real(p90),
    contributed: planned
      .add(offPlan.value)
      .add(contribution.scaleBy(horizonMonths))
      .toString(),
    offPlanValue: offPlan.value.toString(),
    unsimulatedValue: offPlan.unsimulatedValue.toString(),
    unsimulatedInstrumentIds: offPlan.unsimulatedInstrumentIds,
    impliedAnnualReturn: impliedAnnualReturn(planSeries),
    windowMonths,
    limitingInstrumentId,
    simulations,
    seed,
    terCost:
      costs === null || gross === null
        ? null
        : {
            p10: toMoney(percentile(costs, 0.1)).toString(),
            p50: toMoney(percentile(costs, 0.5)).toString(),
            p90: toMoney(percentile(costs, 0.9)).toString(),
            unknownInstrumentIds: gross.unknownInstrumentIds,
          },
  };
}

function simulate(
  planSeries: readonly number[],
  offPlanSeries: readonly number[],
  gross: { plan: readonly number[]; offPlan: readonly number[] } | null,
  horizonMonths: number,
  planned: number,
  offPlan: number,
  contribution: number,
  simulations: number,
  seed: number,
): { finals: Float64Array; costs: Float64Array | null } {
  const random = mulberry32(seed);
  const finals = new Float64Array(simulations);
  const costs = gross === null ? null : new Float64Array(simulations);
  for (let s = 0; s < simulations; s += 1) {
    let inPlan = planned;
    let outOfPlan = offPlan;
    let inPlanGross = planned;
    let outOfPlanGross = offPlan;
    for (let m = 0; m < horizonMonths; m += 1) {
      const drawn = Math.floor(random() * planSeries.length);
      inPlan = (inPlan + contribution) * (1 + (planSeries[drawn] ?? 0));
      outOfPlan = outOfPlan * (1 + (offPlanSeries[drawn] ?? 0));
      if (gross !== null) {
        inPlanGross =
          (inPlanGross + contribution) * (1 + (gross.plan[drawn] ?? 0));
        outOfPlanGross = outOfPlanGross * (1 + (gross.offPlan[drawn] ?? 0));
      }
    }
    finals[s] = inPlan + outOfPlan;
    if (costs !== null) {
      costs[s] = inPlanGross + outOfPlanGross - (inPlan + outOfPlan);
    }
  }
  return { finals: finals.sort(), costs: costs === null ? null : costs.sort() };
}

function impliedAnnualReturn(series: readonly number[]): string {
  if (series.length === 0) return "0";
  let product = 1;
  for (const change of series) {
    if (1 + change <= 0) return "-1";
    product *= 1 + change;
  }
  const monthly = product ** (1 / series.length);
  return new Decimal(monthly ** MONTHS_PER_YEAR - 1).toFixed(6);
}

function percentile(sorted: Float64Array, q: number): number {
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  const a = sorted[low] ?? 0;
  const b = sorted[high] ?? a;
  return a + (b - a) * (position - low);
}

function toMoney(value: number): Money {
  if (!Number.isFinite(value)) {
    throw new Error(
      "A simulated path left the number line. Check the price history for a bad candle before trusting any of this.",
    );
  }
  return Money.fromString(new Decimal(value).toFixed(2));
}

function deflator(
  monthlyInflation: string | null | undefined,
  horizonMonths: number,
): Decimal | null {
  if (monthlyInflation == null || monthlyInflation === "") return null;
  const rate = new Decimal(monthlyInflation);
  if (!rate.isFinite() || rate.lte(-1)) return null;
  const factor = rate.plus(1).pow(horizonMonths);
  return factor.gt(0) ? factor : null;
}
