import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  computeProjection,
  DEFAULT_SIMULATIONS,
  mulberry32,
  projectionWindow,
  startingValue,
  toMonthlyReturns,
  type MonthlyReturn,
  type ProjectionHeldLine,
  type ProjectionSourceLine,
} from "./projection";

function returns(from: string, months: number, seed = 1): MonthlyReturn[] {
  const random = mulberry32(seed);
  const [startYear, startMonth] = from.split("-").map(Number);
  const out: MonthlyReturn[] = [];
  for (let i = 0; i < months; i += 1) {
    const month = (startMonth ?? 1) - 1 + i;
    const year = (startYear ?? 2000) + Math.floor(month / 12);
    const period = `${year}-${String((month % 12) + 1).padStart(2, "0")}`;
    out.push({ period, change: random() * 0.06 - 0.02 });
  }
  return out;
}

const line = (
  instrumentId: string,
  targetWeight: string,
  monthlyReturns: MonthlyReturn[],
): ProjectionSourceLine => ({ instrumentId, targetWeight, monthlyReturns });

describe("toMonthlyReturns", () => {
  it("takes the last close of each month and skips the incomplete one", () => {
    const result = toMonthlyReturns(
      [
        { asOf: new Date("2024-01-15T17:00:00Z"), price: "90" },
        { asOf: new Date("2024-01-31T17:00:00Z"), price: "100" },
        { asOf: new Date("2024-02-29T17:00:00Z"), price: "110" },
        { asOf: new Date("2024-03-05T17:00:00Z"), price: "500" },
      ],
      new Date("2024-03-10T12:00:00Z"),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.period).toBe("2024-02");
    expect(result[0]?.change).toBeCloseTo(0.1, 10);
  });

  it("skips a month whose predecessor is missing rather than bridging the gap", () => {
    const result = toMonthlyReturns(
      [
        { asOf: new Date("2024-01-31T17:00:00Z"), price: "100" },
        { asOf: new Date("2024-04-30T17:00:00Z"), price: "130" },
        { asOf: new Date("2024-05-31T17:00:00Z"), price: "143" },
      ],
      new Date("2024-07-01T12:00:00Z"),
    );

    expect(result.map((r) => r.period)).toEqual(["2024-05"]);
  });

  it("puts a close in the Madrid month, not the UTC one", () => {
    const result = toMonthlyReturns(
      [
        { asOf: new Date("2024-02-29T17:00:00Z"), price: "100" },
        { asOf: new Date("2024-03-15T17:00:00Z"), price: "105" },
        { asOf: new Date("2024-03-31T23:30:00Z"), price: "110" },
      ],
      new Date("2024-06-01T12:00:00Z"),
    );

    expect(result.map((r) => r.period)).toEqual(["2024-03", "2024-04"]);
    expect(result[0]?.change).toBeCloseTo(0.05, 10);
    expect(result[1]?.change).toBeCloseTo(110 / 105 - 1, 10);
  });
});

describe("DEFAULT_SIMULATIONS", () => {
  it("is pinned, so it moves only when pnpm projection:converge says it should", () => {
    expect(DEFAULT_SIMULATIONS).toBe(10000);
  });
});

describe("computeProjection", () => {
  const lines = [
    line("A", "0.6", returns("2015-01", 120, 7)),
    line("B", "0.4", returns("2015-01", 120, 11)),
  ];

  it("returns the same result twice for the same seed", () => {
    const input = {
      horizonMonths: 60,
      monthlyContribution: "300",
      plannedValue: "10000",
      lines,
      seed: 42,
      simulations: 500,
    };

    expect(computeProjection(input)).toEqual(computeProjection(input));
  });

  it("moves when the seed does", () => {
    const base = {
      horizonMonths: 60,
      monthlyContribution: "300",
      lines,
      simulations: 500,
    };

    expect(computeProjection({ ...base, seed: 1 }).p50).not.toBe(
      computeProjection({ ...base, seed: 2 }).p50,
    );
  });

  it("orders the percentiles by construction", () => {
    const result = computeProjection({
      horizonMonths: 120,
      monthlyContribution: "250",
      lines,
      simulations: 500,
    });

    expect(new Decimal(result.p10).lte(result.p25)).toBe(true);
    expect(new Decimal(result.p25).lte(result.p50)).toBe(true);
    expect(new Decimal(result.p50).lte(result.p75)).toBe(true);
    expect(new Decimal(result.p75).lte(result.p90)).toBe(true);
  });

  it("splits the draws where a quartile splits them, not near it", () => {
    const flat = returns("2015-01", 120).map((r) => ({ ...r, change: 0 }));
    const result = computeProjection({
      horizonMonths: 12,
      monthlyContribution: "100",
      lines: [line("A", "1", flat)],
      simulations: 400,
    });

    expect(result.p25).toBe("1200");
    expect(result.p75).toBe("1200");
  });

  it("truncates the window to the shortest history and names it", () => {
    const result = computeProjection({
      horizonMonths: 12,
      monthlyContribution: "100",
      simulations: 200,
      lines: [
        line("LONG", "0.5", returns("2015-01", 120, 7)),
        line("SHORT", "0.5", returns("2023-01", 18, 9)),
      ],
    });

    expect(result.windowMonths).toBe(18);
    expect(result.limitingInstrumentId).toBe("SHORT");
  });

  it("refuses a horizon of zero or less instead of returning an empty result", () => {
    const input = {
      monthlyContribution: "100",
      lines,
      simulations: 100,
    };

    expect(() => computeProjection({ ...input, horizonMonths: 0 })).toThrow(
      /whole number of months/,
    );
    expect(() => computeProjection({ ...input, horizonMonths: -12 })).toThrow(
      /whole number of months/,
    );
  });

  it("refuses lines that share no month rather than inventing one", () => {
    expect(() =>
      computeProjection({
        horizonMonths: 12,
        monthlyContribution: "100",
        simulations: 100,
        lines: [
          line("A", "0.5", returns("2015-01", 12, 3)),
          line("B", "0.5", returns("2020-01", 12, 4)),
        ],
      }),
    ).toThrow(/share no month/);
  });

  it("lands a single 100% line inside the range its own history implies", () => {
    const history = returns("2015-01", 120, 5);
    const result = computeProjection({
      horizonMonths: 60,
      monthlyContribution: "0",
      plannedValue: "10000",
      lines: [line("ONLY", "1", history)],
      simulations: 2000,
    });

    const changes = history.map((r) => 1 + r.change).sort((a, b) => a - b);
    const worst = changes.slice(0, 60).reduce((p, c) => p * c, 10000);
    const best = changes.slice(-60).reduce((p, c) => p * c, 10000);

    expect(Number(result.p50)).toBeGreaterThan(worst);
    expect(Number(result.p50)).toBeLessThan(best);
  });

  it("counts every scheduled euro as contributed, today's value included", () => {
    const result = computeProjection({
      horizonMonths: 24,
      monthlyContribution: "150",
      plannedValue: "1000",
      lines,
      simulations: 100,
    });

    expect(result.contributed).toBe("4600");
  });

  it("leaves the real figures unanswered when no inflation is given", () => {
    const result = computeProjection({
      horizonMonths: 24,
      monthlyContribution: "150",
      lines,
      simulations: 100,
    });

    expect(result.p50Real).toBeNull();
  });

  it("deflates by the constant compounded over the horizon", () => {
    const result = computeProjection({
      horizonMonths: 24,
      monthlyContribution: "150",
      lines,
      simulations: 100,
      monthlyInflation: "0.002",
    });

    const factor = new Decimal("1.002").pow(24);
    expect(new Decimal(result.p50Real ?? "0").toFixed(2)).toBe(
      new Decimal(result.p50).div(factor).toFixed(2),
    );
    expect(new Decimal(result.p25Real ?? "0").toFixed(2)).toBe(
      new Decimal(result.p25).div(factor).toFixed(2),
    );
    expect(new Decimal(result.p75Real ?? "0").toFixed(2)).toBe(
      new Decimal(result.p75).div(factor).toFixed(2),
    );
  });

  it("reports the annualised drift the sampled window compounds to", () => {
    const flat = returns("2015-01", 60).map((r) => ({ ...r, change: 0.01 }));
    const result = computeProjection({
      horizonMonths: 12,
      monthlyContribution: "0",
      plannedValue: "1000",
      lines: [line("FLAT", "1", flat)],
      simulations: 50,
    });

    expect(Number(result.impliedAnnualReturn)).toBeCloseTo(1.01 ** 12 - 1, 6);
  });
});

const held = (
  instrumentId: string,
  value: string,
  monthlyReturns: MonthlyReturn[],
): ProjectionHeldLine => ({ instrumentId, value, monthlyReturns });

describe("the off-plan pot", () => {
  const window = returns("2015-01", 60, 7);
  const plan = [line("PLAN", "1", window)];

  it("compounds off-plan money at its own returns, not the plan's", () => {
    const flatPlan = [
      line(
        "PLAN",
        "1",
        window.map((r) => ({ ...r, change: 0 })),
      ),
    ];
    const growing = window.map((r) => ({ ...r, change: 0.01 }));

    const result = computeProjection({
      horizonMonths: 12,
      monthlyContribution: "0",
      plannedValue: "1000",
      lines: flatPlan,
      heldLines: [held("BTC", "1000", growing)],
      simulations: 50,
    });

    expect(Number(result.p50)).toBeCloseTo(1000 + 1000 * 1.01 ** 12, 2);
  });

  it("draws the same month for both pots, so the correlation survives", () => {
    const swing = window.map((r, index) => ({
      ...r,
      change: index % 2 === 0 ? 0.2 : -0.2,
    }));

    const result = computeProjection({
      horizonMonths: 24,
      monthlyContribution: "0",
      plannedValue: "1000",
      lines: [line("PLAN", "1", swing)],
      heldLines: [held("SAME", "1000", swing)],
      simulations: 2000,
    });

    const solo = computeProjection({
      horizonMonths: 24,
      monthlyContribution: "0",
      plannedValue: "2000",
      lines: [line("PLAN", "1", swing)],
      simulations: 2000,
    });

    expect(Number(result.p10)).toBeCloseTo(Number(solo.p10), 2);
    expect(Number(result.p90)).toBeCloseTo(Number(solo.p90), 2);
  });

  it("sets aside an off-plan position that does not cover the plan's window", () => {
    const result = computeProjection({
      horizonMonths: 12,
      monthlyContribution: "0",
      plannedValue: "1000",
      lines: plan,
      heldLines: [
        held("OLD", "500", window),
        held("YOUNG", "300", returns("2019-01", 6, 3)),
      ],
      simulations: 50,
    });

    expect(result.offPlanValue).toBe("500");
    expect(result.unsimulatedValue).toBe("300");
    expect(result.unsimulatedInstrumentIds).toEqual(["YOUNG"]);
  });

  it("never lets an off-plan position shrink the window the plan set", () => {
    const withYoung = computeProjection({
      horizonMonths: 12,
      monthlyContribution: "0",
      plannedValue: "1000",
      lines: plan,
      heldLines: [held("YOUNG", "300", returns("2019-01", 6, 3))],
      simulations: 50,
    });

    expect(withYoung.windowMonths).toBe(projectionWindow(plan).windowMonths);
    expect(withYoung.limitingInstrumentId).toBe("PLAN");
  });

  it("keeps the value set aside out of the totals entirely", () => {
    const result = computeProjection({
      horizonMonths: 12,
      monthlyContribution: "0",
      plannedValue: "0",
      lines: plan,
      heldLines: [held("YOUNG", "300", returns("2019-01", 6, 3))],
      simulations: 50,
    });

    expect(result.p50).toBe("0");
    expect(result.contributed).toBe("0");
    expect(result.unsimulatedValue).toBe("300");
  });
});

describe("startingValue", () => {
  const window = returns("2015-01", 60, 7);
  const plan = [line("PLAN", "1", window)];

  it("counts the planned pot and the covering off-plan positions only", () => {
    expect(
      startingValue({
        plannedValue: "1000",
        lines: plan,
        heldLines: [
          held("OLD", "500", window),
          held("YOUNG", "300", returns("2019-01", 6, 3)),
        ],
      }),
    ).toBe("1500");
  });
});
