import { describe, expect, it } from "vitest";

import { newtonRate, xirr, type CashFlow } from "./xirr";

const at = (date: string, amount: number): CashFlow => ({
  t: new Date(date).getTime(),
  amount,
});

describe("xirr", () => {
  it("matches the published Excel XIRR example", () => {
    const flows = [
      at("2008-01-01", -10000),
      at("2008-03-01", 2750),
      at("2008-10-30", 4250),
      at("2009-02-15", 3250),
      at("2009-04-01", 2750),
    ];
    expect(xirr(flows)).toBeCloseTo(0.373362535, 8);
  });

  it("returns exactly the annual rate for one buy held one year", () => {
    expect(xirr([at("2026-01-01", -1000), at("2027-01-01", 1100)])).toBeCloseTo(
      0.1,
      10,
    );
  });

  it("prices a mid-period contribution above the naive total return", () => {
    const rate = xirr([
      at("2026-01-01", -1000),
      at("2026-07-02", -1000),
      at("2027-01-01", 2200),
    ]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeGreaterThan(0.1);
    expect(rate!).toBeLessThan(0.2);
  });

  it("is insensitive to the ordering of the flows", () => {
    const flows = [
      at("2008-10-30", 4250),
      at("2008-01-01", -10000),
      at("2009-04-01", 2750),
      at("2008-03-01", 2750),
      at("2009-02-15", 3250),
    ];
    expect(xirr(flows)).toBeCloseTo(0.373362535, 8);
  });

  it("falls back to bisection on flows Newton alone cannot solve", () => {
    const flows = [
      at("2020-05-29", -8478.5),
      at("2020-09-13", -3267.8),
      at("2021-03-02", 1129.5),
    ];

    expect(newtonRate(flows)).toBeNull();

    const rate = xirr(flows);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(-0.97396128, 6);

    const t0 = flows[0]!.t;
    const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    const npv = flows.reduce(
      (sum, f) => sum + f.amount / Math.pow(1 + rate!, (f.t - t0) / YEAR_MS),
      0,
    );
    expect(npv).toBeCloseTo(0, 5);
  });

  it("refuses when every flow has the same sign", () => {
    expect(
      xirr([
        at("2026-01-01", -1000),
        at("2026-06-01", -500),
        at("2026-12-01", -750),
      ]),
    ).toBeNull();

    expect(xirr([at("2026-01-01", 1000), at("2026-06-01", 500)])).toBeNull();
  });

  it("refuses a zero flow set, a single flow, and non-finite amounts", () => {
    expect(xirr([])).toBeNull();
    expect(xirr([at("2026-01-01", -1000)])).toBeNull();
    expect(
      xirr([at("2026-01-01", -1000), at("2027-01-01", Number.NaN)]),
    ).toBeNull();
    const huge = Number.POSITIVE_INFINITY;
    expect(xirr([at("2026-01-01", -1000), at("2027-01-01", huge)])).toBeNull();
  });

  it("refuses when no rate solves the flows", () => {
    expect(
      xirr([
        at("2026-01-01", -1000),
        at("2027-01-01", 100),
        at("2028-01-01", -1000),
      ]),
    ).toBeNull();
  });

  it("lands on a real root when the flows admit more than one", () => {
    const rate = xirr([
      at("2026-01-01", -1000),
      at("2027-01-01", 5000),
      at("2028-01-01", -6000),
    ]);
    expect(rate).not.toBeNull();
    expect([1, 2].some((root) => Math.abs(rate! - root) < 1e-6)).toBe(true);
  });
});
