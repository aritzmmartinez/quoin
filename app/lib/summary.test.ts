import { describe, expect, it } from "vitest";

import { computeRangeChange } from "./summary";

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
