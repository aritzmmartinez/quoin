import { describe, expect, it } from "vitest";

import type { Instrument, PortfolioTarget } from "~/core/domain";
import type { ProjectionPricePoint } from "~/core/projections";

import {
  buildProjectionSource,
  DEFAULT_HORIZON_YEARS,
  GOAL_PARAM,
  HORIZON_PARAM,
  MAX_HORIZON_YEARS,
  MIN_WINDOW_MONTHS,
  offPlanState,
  parseGoal,
  parseHorizonYears,
} from "./projection";

const target = (lines: [string, string][]): PortfolioTarget => ({
  id: "v1",
  name: "Plan",
  activeFrom: new Date("2026-01-01T00:00:00.000Z"),
  note: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  lines: lines.map(([instrumentId, monthlyAmount]) => ({
    instrumentId,
    monthlyAmount,
  })),
});

const instrument = (id: string, name: string): Instrument => ({
  id,
  name,
  type: "ETF",
  currency: "EUR",
});

function monthlyCloses(
  fromYear: number,
  months: number,
): ProjectionPricePoint[] {
  const points: ProjectionPricePoint[] = [];
  for (let i = 0; i < months; i += 1) {
    const year = fromYear + Math.floor(i / 12);
    const month = String((i % 12) + 1).padStart(2, "0");
    points.push({
      asOf: new Date(`${year}-${month}-15T12:00:00.000Z`),
      price: (100 * 1.01 ** i).toFixed(4),
    });
  }
  return points;
}

const params = (query: string) => new URLSearchParams(query);

describe("MIN_WINDOW_MONTHS", () => {
  it("is pinned at 60, so lowering it for debugging cannot survive a commit", () => {
    expect(MIN_WINDOW_MONTHS).toBe(60);
  });
});

describe("offPlanState", () => {
  it("separates an empty pot from having nothing outside the plan", () => {
    expect(
      offPlanState({ offPlanValue: "0", unsimulatedInstrumentIds: [] }),
    ).toBe("none");
    expect(
      offPlanState({ offPlanValue: "0", unsimulatedInstrumentIds: ["BTC"] }),
    ).toBe("all-excluded");
  });

  it("is simulated whenever anything made it into the pot", () => {
    expect(
      offPlanState({
        offPlanValue: "1500.00",
        unsimulatedInstrumentIds: ["BTC"],
      }),
    ).toBe("simulated");
  });
});

describe("parseHorizonYears", () => {
  it("defaults when absent or unreadable", () => {
    expect(parseHorizonYears(params(""))).toBe(DEFAULT_HORIZON_YEARS);
    expect(parseHorizonYears(params(`${HORIZON_PARAM}=x`))).toBe(
      DEFAULT_HORIZON_YEARS,
    );
  });

  it("clamps rather than rejecting an out-of-range horizon", () => {
    expect(parseHorizonYears(params(`${HORIZON_PARAM}=0`))).toBe(1);
    expect(parseHorizonYears(params(`${HORIZON_PARAM}=-5`))).toBe(1);
    expect(parseHorizonYears(params(`${HORIZON_PARAM}=500`))).toBe(
      MAX_HORIZON_YEARS,
    );
  });

  it("reads a comma as a decimal separator and rounds to whole years", () => {
    expect(parseHorizonYears(params(`${HORIZON_PARAM}=7%2C6`))).toBe(8);
  });
});

describe("parseGoal", () => {
  it("returns null for anything that is not a positive amount", () => {
    expect(parseGoal(params(""))).toBeNull();
    expect(parseGoal(params(`${GOAL_PARAM}=0`))).toBeNull();
    expect(parseGoal(params(`${GOAL_PARAM}=-100`))).toBeNull();
    expect(parseGoal(params(`${GOAL_PARAM}=abc`))).toBeNull();
  });

  it("accepts a comma-separated amount", () => {
    expect(parseGoal(params(`${GOAL_PARAM}=1000000%2C5`))).toBe("1000000.50");
  });
});

describe("buildProjectionSource", () => {
  const asOf = new Date("2026-08-20T12:00:00.000Z");
  const instruments = new Map([
    ["A", instrument("A", "Fondo A")],
    ["B", instrument("B", "Fondo B")],
  ]);

  it("names the plan lines with no price history instead of dropping them", () => {
    const source = buildProjectionSource(
      target([
        ["A", "300"],
        ["B", "100"],
      ]),
      new Map([["A", monthlyCloses(2020, 60)]]),
      instruments,
      new Map(),
      asOf,
    );

    expect(source.lines.map((line) => line.instrumentId)).toEqual(["A"]);
    expect(source.excluded).toEqual([
      { instrumentId: "B", name: "Fondo B", weight: "0.25" },
    ]);
    expect(source.coverage).toBe("0.750000");
  });

  it("keeps a short history rather than excluding it", () => {
    const source = buildProjectionSource(
      target([
        ["A", "300"],
        ["B", "100"],
      ]),
      new Map([
        ["A", monthlyCloses(2020, 60)],
        ["B", monthlyCloses(2026, 4)],
      ]),
      instruments,
      new Map(),
      asOf,
    );

    expect(source.lines).toHaveLength(2);
    expect(source.excluded).toEqual([]);
    expect(source.coverage).toBe("1.000000");
  });

  it("builds the off-plan pot from what is held but unplanned", () => {
    const source = buildProjectionSource(
      target([["A", "300"]]),
      new Map([
        ["A", monthlyCloses(2020, 60)],
        ["Z", monthlyCloses(2021, 48)],
      ]),
      instruments,
      new Map([
        ["Z", "1500.00"],
        ["EMPTY", "0.00"],
      ]),
      asOf,
    );

    expect(source.lines.map((line) => line.instrumentId)).toEqual(["A"]);
    expect(source.heldLines).toHaveLength(1);
    expect(source.heldLines[0]?.instrumentId).toBe("Z");
    expect(source.heldLines[0]?.value).toBe("1500.00");
    expect(source.heldLines[0]?.monthlyReturns.length).toBeGreaterThan(0);
  });

  it("still carries an off-plan position with no history, for core to set aside", () => {
    const source = buildProjectionSource(
      target([["A", "300"]]),
      new Map([["A", monthlyCloses(2020, 60)]]),
      instruments,
      new Map([["NEW", "800.00"]]),
      asOf,
    );

    expect(source.heldLines).toHaveLength(1);
    expect(source.heldLines[0]?.monthlyReturns).toEqual([]);
  });
});
