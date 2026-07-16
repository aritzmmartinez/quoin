import Decimal from "decimal.js";

import type {
  InvestedVsValuePoint,
  PortfolioSummary,
} from "~/core/projections";

import type { Range } from "./range";

export interface RangeChange {
  abs: string | null;
  pct: string | null;
}

export function computeRangeChange(
  series: readonly InvestedVsValuePoint[],
): RangeChange {
  const first = series[0];
  const last = series[series.length - 1];
  if (!first || !last || series.length < 2) return { abs: null, pct: null };

  const pnlStart = new Decimal(first.value).minus(new Decimal(first.invested));
  const pnlEnd = new Decimal(last.value).minus(new Decimal(last.invested));
  const abs = pnlEnd.minus(pnlStart);

  const investedEnd = new Decimal(last.invested);
  const pct = investedEnd.isZero() ? null : abs.div(investedEnd).toFixed(6);

  return { abs: abs.toString(), pct };
}

export function computeHeroChange(
  range: Range,
  series: readonly InvestedVsValuePoint[],
  summary: Pick<PortfolioSummary, "unrealizedPnL" | "returnPct">,
): RangeChange {
  if (range === "all") {
    return { abs: summary.unrealizedPnL, pct: summary.returnPct };
  }
  return computeRangeChange(series);
}
