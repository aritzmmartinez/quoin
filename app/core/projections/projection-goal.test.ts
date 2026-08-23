import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import { solveContribution, solveHorizon } from "./projection-goal";
import {
  computeProjection,
  mulberry32,
  type MonthlyReturn,
  type ProjectionSourceLine,
} from "./projection";

function returns(months: number, seed: number): MonthlyReturn[] {
  const random = mulberry32(seed);
  const out: MonthlyReturn[] = [];
  for (let i = 0; i < months; i += 1) {
    const year = 2015 + Math.floor(i / 12);
    const period = `${year}-${String((i % 12) + 1).padStart(2, "0")}`;
    out.push({ period, change: random() * 0.06 - 0.02 });
  }
  return out;
}

const lines: ProjectionSourceLine[] = [
  { instrumentId: "A", targetWeight: "1", monthlyReturns: returns(120, 7) },
];

const base = { lines, plannedValue: "5000", simulations: 400, seed: 3 };

describe("solveContribution", () => {
  it("finds the smallest contribution whose median reaches the goal", () => {
    const goal = "150000";
    const found = solveContribution({ ...base, horizonMonths: 120 }, goal);
    expect(found).not.toBeNull();

    const at = (contribution: string) =>
      new Decimal(
        computeProjection({
          ...base,
          horizonMonths: 120,
          monthlyContribution: contribution,
        }).p50,
      );

    expect(at(found ?? "0").gte(goal)).toBe(true);
    expect(at(new Decimal(found ?? "0").minus(1).toFixed(2)).lt(goal)).toBe(
      true,
    );
  });

  it("asks for nothing when today's value already covers the goal", () => {
    expect(solveContribution({ ...base, horizonMonths: 12 }, "100")).toBe(
      "0.00",
    );
  });

  it("refuses rather than quoting a number when the goal cannot be reached", () => {
    const wipeout: ProjectionSourceLine[] = [
      {
        instrumentId: "ZERO",
        targetWeight: "1",
        monthlyReturns: returns(24, 1).map((r) => ({ ...r, change: -1 })),
      },
    ];

    expect(
      solveContribution(
        { lines: wipeout, horizonMonths: 12, simulations: 50, seed: 3 },
        "1000",
      ),
    ).toBeNull();
  });
});

describe("solveHorizon", () => {
  it("answers zero without simulating when the goal is already met", () => {
    const disjoint: ProjectionSourceLine[] = [
      { instrumentId: "A", targetWeight: "0.5", monthlyReturns: returns(6, 1) },
      {
        instrumentId: "B",
        targetWeight: "0.5",
        monthlyReturns: returns(6, 2).map((r) => ({
          ...r,
          period: `2030-${r.period.slice(-2)}`,
        })),
      },
    ];

    expect(
      solveHorizon(
        {
          lines: disjoint,
          monthlyContribution: "500",
          plannedValue: "20000",
          simulations: 50,
        },
        "20000",
      ),
    ).toBe(0);
  });

  it("finds the first month whose median reaches the goal", () => {
    const goal = "60000";
    const found = solveHorizon({ ...base, monthlyContribution: "400" }, goal);
    expect(found).not.toBeNull();

    const at = (horizonMonths: number) =>
      new Decimal(
        computeProjection({
          ...base,
          monthlyContribution: "400",
          horizonMonths,
        }).p50,
      );

    expect(at(found ?? 1).gte(goal)).toBe(true);
    expect(at((found ?? 1) - 1).lt(goal)).toBe(true);
  });

  it("refuses when the goal is out of reach inside the cap", () => {
    expect(
      solveHorizon(
        { ...base, monthlyContribution: "100", plannedValue: "0" },
        "1000000000",
        24,
      ),
    ).toBeNull();
  });
});
