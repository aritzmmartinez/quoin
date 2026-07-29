import { describe, expect, it } from "vitest";

import type { InvestedVsValuePoint } from "./invested-vs-value";
import type { MarketValue } from "./market-value";
import type { Position } from "./positions";
import {
  computeAllocation,
  computePortfolioInvestedVsValueSeries,
  computePortfolioSummary,
  computeTopPositions,
} from "./portfolio";
import { tradeMetaKey } from "./trade-meta";

function position(
  overrides: Partial<Position> & { instrumentId: string },
): Position {
  return {
    sleeve: "CORE",
    quantity: "10",
    costBasis: "1000",
    averageCost: "100",
    realizedPnL: "0",
    ...overrides,
  };
}

function priced(
  marketValue: string,
  unrealizedPnL: string,
  weight: string,
): MarketValue {
  return { marketValue, unrealizedPnL, weight };
}

const unpriced: MarketValue = {
  marketValue: null,
  unrealizedPnL: null,
  weight: null,
};

function marketValues(
  entries: readonly [Position, MarketValue][],
): Map<string, MarketValue> {
  return new Map(
    entries.map(([p, mv]) => [tradeMetaKey(p.instrumentId, p.sleeve), mv]),
  );
}

describe("computePortfolioSummary", () => {
  it("aggregates value, invested and P&L across priced positions", () => {
    const a = position({ instrumentId: "A", costBasis: "1000" });
    const b = position({ instrumentId: "B", costBasis: "500" });

    const summary = computePortfolioSummary(
      [a, b],
      marketValues([
        [a, priced("1200", "200", "0.6")],
        [b, priced("800", "300", "0.4")],
      ]),
    );

    expect(summary.totalValue).toBe("2000");
    expect(summary.totalInvested).toBe("1500");
    expect(summary.unrealizedPnL).toBe("500");
    expect(summary.pricedCount).toBe(2);
    expect(summary.unpricedCount).toBe(0);
    expect(summary.returnPct).toBe("0.333333");
  });

  it("excludes unpriced holdings from both sides of the comparison", () => {
    const a = position({ instrumentId: "A", costBasis: "1000" });
    const b = position({ instrumentId: "B", costBasis: "500" });

    const summary = computePortfolioSummary(
      [a, b],
      marketValues([
        [a, priced("1200", "200", "1")],
        [b, unpriced],
      ]),
    );

    expect(summary.totalValue).toBe("1200");
    expect(summary.totalInvested).toBe("1000");
    expect(summary.unrealizedPnL).toBe("200");
    expect(summary.pricedCount).toBe(1);
    expect(summary.unpricedCount).toBe(1);
  });

  it("counts realized P&L from closed positions but not their value", () => {
    const open = position({ instrumentId: "A", costBasis: "1000" });
    const closed = position({
      instrumentId: "B",
      quantity: "0",
      costBasis: "0",
      realizedPnL: "250",
    });

    const summary = computePortfolioSummary(
      [open, closed],
      marketValues([[open, priced("1100", "100", "1")]]),
    );

    expect(summary.totalValue).toBe("1100");
    expect(summary.realizedPnL).toBe("250");
    expect(summary.pricedCount).toBe(1);
    expect(summary.unpricedCount).toBe(0);
  });

  it("returns null returnPct when nothing is invested", () => {
    const summary = computePortfolioSummary([], new Map());

    expect(summary.totalValue).toBe("0");
    expect(summary.returnPct).toBeNull();
  });

  it("does not lose precision on fractional amounts", () => {
    const a = position({ instrumentId: "A", costBasis: "0.1" });
    const b = position({ instrumentId: "B", costBasis: "0.2" });

    const summary = computePortfolioSummary(
      [a, b],
      marketValues([
        [a, priced("0.1", "0", "0.5")],
        [b, priced("0.2", "0", "0.5")],
      ]),
    );

    expect(summary.totalInvested).toBe("0.3");
    expect(summary.totalValue).toBe("0.3");
  });
});

describe("computeAllocation", () => {
  it("groups priced value by category, largest first", () => {
    const a = position({ instrumentId: "A" });
    const b = position({ instrumentId: "B" });
    const c = position({ instrumentId: "C" });

    const slices = computeAllocation(
      [a, b, c],
      marketValues([
        [a, priced("600", "0", "0.6")],
        [b, priced("200", "0", "0.2")],
        [c, priced("200", "0", "0.2")],
      ]),
      new Map([
        ["A", "ETF"],
        ["B", "STOCK"],
        ["C", "ETF"],
      ]),
    );

    expect(slices).toEqual([
      { category: "ETF", value: "800", weight: "0.800000" },
      { category: "STOCK", value: "200", weight: "0.200000" },
    ]);
  });

  it("weights sum to 1 across categories", () => {
    const a = position({ instrumentId: "A" });
    const b = position({ instrumentId: "B" });
    const c = position({ instrumentId: "C" });

    const slices = computeAllocation(
      [a, b, c],
      marketValues([
        [a, priced("333.33", "0", "0.33")],
        [b, priced("333.33", "0", "0.33")],
        [c, priced("333.34", "0", "0.34")],
      ]),
      new Map([
        ["A", "ETF"],
        ["B", "STOCK"],
        ["C", "CRYPTO"],
      ]),
    );

    const sum = slices.reduce((acc, s) => acc + Number(s.weight), 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it("falls back for unclassified instruments and skips unpriced ones", () => {
    const a = position({ instrumentId: "A" });
    const b = position({ instrumentId: "B" });

    const slices = computeAllocation(
      [a, b],
      marketValues([
        [a, priced("100", "0", "1")],
        [b, unpriced],
      ]),
      new Map(),
    );

    expect(slices).toEqual([
      { category: "OTHER", value: "100", weight: "1.000000" },
    ]);
  });

  it("returns an empty breakdown when nothing is priced", () => {
    const a = position({ instrumentId: "A" });

    expect(
      computeAllocation([a], marketValues([[a, unpriced]]), new Map()),
    ).toEqual([]);
  });
});

describe("computeTopPositions", () => {
  it("orders by market value and honours the limit", () => {
    const a = position({ instrumentId: "A" });
    const b = position({ instrumentId: "B" });
    const c = position({ instrumentId: "C" });

    const top = computeTopPositions(
      [a, b, c],
      marketValues([
        [a, priced("100", "0", "0.1")],
        [b, priced("500", "0", "0.5")],
        [c, priced("400", "0", "0.4")],
      ]),
      2,
    );

    expect(top.map((row) => row.instrumentId)).toEqual(["B", "C"]);
  });

  it("computes P&L percentage against cost basis", () => {
    const a = position({ instrumentId: "A", costBasis: "1000" });

    const [row] = computeTopPositions(
      [a],
      marketValues([[a, priced("1250", "250", "1")]]),
    );

    expect(row?.unrealizedPnLPct).toBe("0.250000");
  });

  it("returns null P&L percentage for a zero cost basis", () => {
    const a = position({ instrumentId: "A", costBasis: "0" });

    const [row] = computeTopPositions(
      [a],
      marketValues([[a, priced("50", "50", "1")]]),
    );

    expect(row?.unrealizedPnLPct).toBeNull();
  });

  it("omits closed and unpriced positions", () => {
    const open = position({ instrumentId: "A" });
    const closed = position({ instrumentId: "B", quantity: "0" });
    const stale = position({ instrumentId: "C" });

    const top = computeTopPositions(
      [open, closed, stale],
      marketValues([
        [open, priced("100", "0", "1")],
        [closed, priced("0", "0", "0")],
        [stale, unpriced],
      ]),
    );

    expect(top.map((row) => row.instrumentId)).toEqual(["A"]);
  });
});

describe("computePortfolioInvestedVsValueSeries", () => {
  function series(
    points: readonly [number, string, string][],
  ): InvestedVsValuePoint[] {
    return points.map(([t, invested, value]) => ({ t, invested, value }));
  }

  it("sums series sampled at the same timestamps", () => {
    const merged = computePortfolioInvestedVsValueSeries([
      series([
        [1, "100", "100"],
        [2, "100", "110"],
      ]),
      series([
        [1, "50", "50"],
        [2, "50", "60"],
      ]),
    ]);

    expect(merged).toEqual([
      { t: 1, invested: "150", value: "150" },
      { t: 2, invested: "150", value: "170" },
    ]);
  });

  it("carries a series forward across timestamps it does not sample", () => {
    const merged = computePortfolioInvestedVsValueSeries([
      series([
        [1, "100", "100"],
        [3, "100", "130"],
      ]),
      series([[2, "50", "50"]]),
    ]);

    expect(merged).toEqual([
      { t: 1, invested: "100", value: "100" },
      { t: 2, invested: "150", value: "150" },
      { t: 3, invested: "150", value: "180" },
    ]);
  });

  it("contributes nothing before a holding's first point", () => {
    const merged = computePortfolioInvestedVsValueSeries([
      series([[1, "100", "100"]]),
      series([[5, "50", "50"]]),
    ]);

    expect(merged).toEqual([
      { t: 1, invested: "100", value: "100" },
      { t: 5, invested: "150", value: "150" },
    ]);
  });

  it("sorts unsorted input and tolerates empty series", () => {
    const merged = computePortfolioInvestedVsValueSeries([
      series([
        [3, "100", "130"],
        [1, "100", "100"],
      ]),
      [],
    ]);

    expect(merged.map((p) => p.t)).toEqual([1, 3]);
    expect(merged[1]?.value).toBe("130");
  });

  it("returns an empty series when there is nothing to merge", () => {
    expect(computePortfolioInvestedVsValueSeries([])).toEqual([]);
    expect(computePortfolioInvestedVsValueSeries([[], []])).toEqual([]);
  });
});
