import Decimal from "decimal.js";

import { Money } from "../domain";
import type { InvestedVsValuePoint } from "./invested-vs-value";
import type { MarketValue } from "./market-value";
import type { Position } from "./positions";
import { tradeMetaKey } from "./trade-meta";

export interface PortfolioSummary {
  totalValue: string;
  totalInvested: string;
  unrealizedPnL: string;
  realizedPnL: string;
  returnPct: string | null;
  pricedCount: number;
  unpricedCount: number;
}

export function computePortfolioSummary(
  positions: readonly Position[],
  marketValues: ReadonlyMap<string, MarketValue>,
): PortfolioSummary {
  let totalValue = Money.zero();
  let totalInvested = Money.zero();
  let realizedPnL = Money.zero();
  let pricedCount = 0;
  let unpricedCount = 0;

  for (const position of positions) {
    realizedPnL = realizedPnL.add(Money.fromString(position.realizedPnL));

    const isOpen = !new Decimal(position.quantity).isZero();
    if (!isOpen) continue;

    const marketValue = marketValues.get(
      tradeMetaKey(position.instrumentId, position.sleeve),
    );

    if (!marketValue || marketValue.marketValue === null) {
      unpricedCount += 1;
      continue;
    }

    totalValue = totalValue.add(Money.fromString(marketValue.marketValue));
    totalInvested = totalInvested.add(Money.fromString(position.costBasis));
    pricedCount += 1;
  }

  const unrealizedPnL = totalValue.subtract(totalInvested);
  const returnPct = totalInvested.isZero()
    ? null
    : new Decimal(unrealizedPnL.toString())
        .div(new Decimal(totalInvested.toString()))
        .toFixed(6);

  return {
    totalValue: totalValue.toString(),
    totalInvested: totalInvested.toString(),
    unrealizedPnL: unrealizedPnL.toString(),
    realizedPnL: realizedPnL.toString(),
    returnPct,
    pricedCount,
    unpricedCount,
  };
}

export interface AllocationSlice {
  category: string;
  value: string;
  weight: string;
}

export function computeAllocation(
  positions: readonly Position[],
  marketValues: ReadonlyMap<string, MarketValue>,
  categories: ReadonlyMap<string, string>,
  fallbackCategory = "OTHER",
): AllocationSlice[] {
  const totals = new Map<string, Money>();
  let total = Money.zero();

  for (const position of positions) {
    const marketValue = marketValues.get(
      tradeMetaKey(position.instrumentId, position.sleeve),
    );
    if (!marketValue || marketValue.marketValue === null) continue;

    const value = Money.fromString(marketValue.marketValue);
    if (value.isZero()) continue;

    const category = categories.get(position.instrumentId) ?? fallbackCategory;
    totals.set(category, (totals.get(category) ?? Money.zero()).add(value));
    total = total.add(value);
  }

  if (total.isZero()) return [];
  const totalDecimal = new Decimal(total.toString());

  return [...totals]
    .map(([category, value]) => ({
      category,
      value: value.toString(),
      weight: new Decimal(value.toString()).div(totalDecimal).toFixed(6),
    }))
    .sort(
      (a, b) =>
        new Decimal(b.value).comparedTo(new Decimal(a.value)) ||
        a.category.localeCompare(b.category),
    );
}

export interface TopPosition {
  instrumentId: string;
  sleeve: Position["sleeve"];
  marketValue: string;
  weight: string;
  unrealizedPnL: string;
  unrealizedPnLPct: string | null;
}

export function computeTopPositions(
  positions: readonly Position[],
  marketValues: ReadonlyMap<string, MarketValue>,
  limit = 5,
): TopPosition[] {
  const rows: TopPosition[] = [];

  for (const position of positions) {
    if (new Decimal(position.quantity).isZero()) continue;

    const marketValue = marketValues.get(
      tradeMetaKey(position.instrumentId, position.sleeve),
    );
    if (
      !marketValue ||
      marketValue.marketValue === null ||
      marketValue.unrealizedPnL === null ||
      marketValue.weight === null
    ) {
      continue;
    }

    const costBasis = new Decimal(position.costBasis);
    rows.push({
      instrumentId: position.instrumentId,
      sleeve: position.sleeve,
      marketValue: marketValue.marketValue,
      weight: marketValue.weight,
      unrealizedPnL: marketValue.unrealizedPnL,
      unrealizedPnLPct: costBasis.isZero()
        ? null
        : new Decimal(marketValue.unrealizedPnL).div(costBasis).toFixed(6),
    });
  }

  return rows
    .sort(
      (a, b) =>
        new Decimal(b.marketValue).comparedTo(new Decimal(a.marketValue)) ||
        a.instrumentId.localeCompare(b.instrumentId),
    )
    .slice(0, limit);
}

export function computePortfolioInvestedVsValueSeries(
  seriesByInstrument: readonly (readonly InvestedVsValuePoint[])[],
): InvestedVsValuePoint[] {
  const timestamps = new Set<number>();
  for (const series of seriesByInstrument) {
    for (const point of series) timestamps.add(point.t);
  }
  if (timestamps.size === 0) return [];

  const sorted = [...seriesByInstrument].map((series) =>
    [...series].sort((a, b) => a.t - b.t),
  );
  const cursors = sorted.map(() => 0);
  const carried: (InvestedVsValuePoint | undefined)[] = sorted.map(
    () => undefined,
  );

  return [...timestamps]
    .sort((a, b) => a - b)
    .map((t) => {
      let invested = Money.zero();
      let value = Money.zero();

      for (let i = 0; i < sorted.length; i += 1) {
        const series = sorted[i]!;
        let cursor = cursors[i]!;
        while (cursor < series.length && series[cursor]!.t <= t) {
          carried[i] = series[cursor]!;
          cursor += 1;
        }
        cursors[i] = cursor;

        const point = carried[i];
        if (!point) continue;
        invested = invested.add(Money.fromString(point.invested));
        value = value.add(Money.fromString(point.value));
      }

      return { t, invested: invested.toString(), value: value.toString() };
    });
}
