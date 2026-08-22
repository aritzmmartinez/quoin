import Decimal from "decimal.js";

import { Money } from "./money";

export type Period = string;

const MONTH_IN_MADRID = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
});

export function periodOf(date: Date): Period {
  const parts = MONTH_IN_MADRID.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  if (!year || !month) {
    throw new Error(`Cannot derive a period from ${date.toISOString()}`);
  }
  return `${year}-${month}`;
}

export type Revalue = (money: Money, ts: Date) => Money;

export interface IndexPoint {
  period: Period;
  indexValue: string;
  base: string;
}

export class InflationIndex {
  private constructor(
    readonly series: string,
    readonly base: string,
    private readonly levels: ReadonlyMap<Period, Decimal>,
    private readonly latest: Period | null,
  ) {}

  static from(series: string, points: readonly IndexPoint[]): InflationIndex {
    const bases = [...new Set(points.map((p) => p.base))].sort();
    if (bases.length > 1) {
      throw new Error(
        `Inflation series "${series}" mixes bases (${bases.join(", ")}). ` +
          `Levels from different bases cannot share a ratio; re-sync the whole series.`,
      );
    }

    const levels = new Map<Period, Decimal>();
    let latest: Period | null = null;
    for (const point of points) {
      levels.set(point.period, new Decimal(point.indexValue));
      if (latest === null || point.period > latest) latest = point.period;
    }

    return new InflationIndex(series, bases[0] ?? "", levels, latest);
  }

  latestPeriod(): Period | null {
    return this.latest;
  }

  has(period: Period): boolean {
    return this.levels.has(period);
  }

  levelAt(period: Period): Decimal | undefined {
    return this.levels.get(period);
  }

  get size(): number {
    return this.levels.size;
  }
}

export function deflate(
  index: InflationIndex,
  amount: Money,
  from: Period,
  to: Period,
): Money | null {
  const fromLevel = index.levelAt(from);
  const toLevel = index.levelAt(to);
  if (!fromLevel || !toLevel || fromLevel.isZero()) return null;
  return amount.scaleBy(toLevel).divideBy(fromLevel);
}

const MIN_MONTHS_FOR_AVERAGE = 12;

function monthsBetween(from: Period, to: Period): number {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  if (
    fromYear === undefined ||
    fromMonth === undefined ||
    toYear === undefined ||
    toMonth === undefined ||
    !Number.isInteger(fromYear) ||
    !Number.isInteger(fromMonth) ||
    !Number.isInteger(toYear) ||
    !Number.isInteger(toMonth)
  ) {
    throw new Error(`Not a period pair: "${from}" to "${to}"`);
  }
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

export function averageMonthlyInflation(
  points: readonly IndexPoint[],
): string | null {
  if (points.length < 2) return null;

  const bases = [...new Set(points.map((point) => point.base))].sort();
  if (bases.length > 1) {
    throw new Error(
      `Cannot average across bases (${bases.join(", ")}): levels from ` +
        `different reference years do not share a ratio.`,
    );
  }

  const sorted = [...points].sort((a, b) => a.period.localeCompare(b.period));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) return null;

  const months = monthsBetween(first.period, last.period);
  if (months < MIN_MONTHS_FOR_AVERAGE) return null;

  const from = new Decimal(first.indexValue);
  const to = new Decimal(last.indexValue);
  if (!from.gt(0) || !to.gt(0)) return null;

  return to.div(from).pow(new Decimal(1).div(months)).minus(1).toString();
}
