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
