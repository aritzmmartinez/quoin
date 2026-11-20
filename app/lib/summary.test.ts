import { describe, expect, it } from "vitest";

import type { Instrument } from "~/core/domain";
import {
  computeAllocation,
  type MarketValue,
  type Position,
} from "~/core/projections";

import {
  allocationCategories,
  computeHeroChange,
  computeRangeChange,
} from "./summary";

const point = (t: number, invested: string, value: string) => ({
  t,
  invested,
  value,
});

describe("computeRangeChange", () => {
  it("reports the change in unrealized P&L, not in value", () => {
    const change = computeRangeChange([
      point(1, "100", "100"),
      point(2, "250", "250"),
    ]);

    expect(change.abs).toBe("0");
  });

  it("does not report a gain on a portfolio that lost money", () => {
    const change = computeRangeChange([
      point(1, "100", "100"),
      point(2, "250", "220"),
    ]);

    expect(change.abs).toBe("-30");
    expect(Number(change.pct)).toBeLessThan(0);
  });

  it("reduces to total P&L over total invested for a full history", () => {
    const change = computeRangeChange([
      point(1, "1000", "1000"),
      point(2, "1000", "1250"),
    ]);

    expect(change.abs).toBe("250");
    expect(change.pct).toBe("0.250000");
  });

  it("measures from the start of the window, not from inception", () => {
    const change = computeRangeChange([
      point(2, "1000", "1100"),
      point(3, "1000", "1250"),
    ]);

    expect(change.abs).toBe("150");
  });

  it("returns nulls when there is nothing to compare", () => {
    expect(computeRangeChange([])).toEqual({ abs: null, pct: null });
    expect(computeRangeChange([point(1, "100", "100")])).toEqual({
      abs: null,
      pct: null,
    });
  });

  it("returns a null percentage when nothing is invested at the end", () => {
    const change = computeRangeChange([
      point(1, "100", "120"),
      point(2, "0", "0"),
    ]);

    expect(change.abs).toBe("-20");
    expect(change.pct).toBeNull();
  });
});

describe("computeHeroChange", () => {
  const summary = { unrealizedPnL: "767.47", returnPct: "0.070000" };

  it("reports current P&L all-time, ignoring the series' fee-laden start", () => {
    const change = computeHeroChange(
      "all",
      [point(1, "101", "100"), point(2, "10920.97", "11688.44")],
      summary,
    );

    expect(change.abs).toBe("767.47");
    expect(change.pct).toBe("0.070000");
  });

  it("agrees with the P&L tile by construction, whatever the series says", () => {
    const change = computeHeroChange("all", [], summary);

    expect(change.abs).toBe(summary.unrealizedPnL);
  });

  it("measures a bounded window from its own start", () => {
    const change = computeHeroChange(
      "1y",
      [point(1, "1000", "1100"), point(2, "1000", "1250")],
      summary,
    );

    expect(change.abs).toBe("150");
  });
});

describe("the allocation by category", () => {
  const instrument = (over: Partial<Instrument> & Pick<Instrument, "id">) =>
    ({
      name: over.id,
      type: "ETF",
      assetClass: null,
      quoteSymbol: null,
      exposureKind: null,
      exposureLeafId: null,
      thesis: "CORE",
      ...over,
    }) as Instrument;

  const instruments = [
    instrument({ id: "US00TEST0401", type: "STOCK" }),
    instrument({ id: "TESTCOIN", type: "CRYPTO" }),
    instrument({ id: "TESTUSD", type: "CRYPTO" }),
    instrument({ id: "IE00TEST0402" }),
    instrument({ id: "IE00TEST0403", exposureKind: "EQUITY_FUND" }),
    instrument({
      id: "US00TEST0404",
      type: "STOCK",
      exposureKind: "COMMODITY",
    }),
  ];
  const values: [string, string][] = [
    ["US00TEST0401", "300"],
    ["TESTCOIN", "150"],
    ["TESTUSD", "50"],
    ["IE00TEST0402", "200"],
    ["IE00TEST0403", "250"],
    ["US00TEST0404", "50"],
  ];
  const positions = values.map(
    ([id]) => ({ instrumentId: id, quantity: "1" }) as Position,
  );
  const marketValues = new Map(
    values.map(([id, value]) => [id, { marketValue: value } as MarketValue]),
  );

  const slices = computeAllocation(
    positions,
    marketValues,
    allocationCategories(instruments),
  );

  it("draws a stock and a crypto asset with no category under the derived one", () => {
    expect(slices).toContainEqual({
      category: "COMPANY",
      value: "300",
      weight: "0.300000",
    });
    expect(slices).toContainEqual({
      category: "CRYPTO",
      value: "200",
      weight: "0.200000",
    });
  });

  it("leaves only the fund nobody classified unclassified", () => {
    expect(slices).toContainEqual({
      category: "OTHER",
      value: "200",
      weight: "0.200000",
    });
  });

  it("lets a chosen category win over the derived one", () => {
    expect(slices).toContainEqual({
      category: "EQUITY_FUND",
      value: "250",
      weight: "0.250000",
    });
    expect(slices).toContainEqual({
      category: "COMMODITY",
      value: "50",
      weight: "0.050000",
    });
    expect(slices).toHaveLength(5);
  });
});
