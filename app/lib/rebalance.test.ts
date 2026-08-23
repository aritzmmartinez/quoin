import { describe, expect, it } from "vitest";

import type { Instrument, PortfolioTarget } from "~/core/domain";
import type { MarketValue, Position } from "~/core/projections";

import {
  buildRebalancePlan,
  carriedParams,
  CONTRIBUTION_PARAM,
  DEFAULT_DRIFT_THRESHOLD,
  DRIFT_THRESHOLD_PARAM,
  parseContribution,
  parseDriftThreshold,
} from "./rebalance";

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

const position = (instrumentId: string, quantity: string): Position => ({
  instrumentId,
  sleeve: "CORE",
  quantity,
  costBasis: "0",
  averageCost: "0",
  realizedPnL: "0",
});

const priced = (marketValue: string | null): MarketValue => ({
  marketValue,
  unrealizedPnL: null,
  weight: null,
});

describe("parseContribution", () => {
  const of = (raw: string): string | null =>
    parseContribution(new URLSearchParams(`${CONTRIBUTION_PARAM}=${raw}`));

  it("reads an amount and normalises it to cents", () => {
    expect(of("500")).toBe("500.00");
    expect(of("500.5")).toBe("500.50");
  });

  it("accepts the es-ES decimal comma the input will produce", () => {
    expect(of("500,5")).toBe("500.50");
  });

  it("reads junk and negatives as 'not asked yet', never as zero", () => {
    expect(of("abc")).toBeNull();
    expect(of("-100")).toBeNull();
    expect(of("")).toBeNull();
    expect(parseContribution(new URLSearchParams())).toBeNull();
  });
});

describe("carriedParams", () => {
  it("carries the view, or calculating throws the user back to Exposición", () => {
    const carried = carriedParams(
      new URLSearchParams("vista=rebalanceo&aportacion=500&desvio=2"),
    );

    expect(carried).toEqual([["vista", "rebalanceo"]]);
  });

  it("carries every param the form does not own, not a hand-kept list", () => {
    const carried = carriedParams(
      new URLSearchParams("vista=rebalanceo&umbral=20&futuro=x&aportacion=500"),
    );

    expect(carried.map(([key]) => key)).toEqual(["vista", "umbral", "futuro"]);
  });

  it("drops the fields the form renders itself, so they are not submitted twice", () => {
    expect(
      carriedParams(new URLSearchParams("aportacion=500&desvio=2")),
    ).toEqual([]);
  });
});

describe("parseDriftThreshold", () => {
  const of = (raw: string): string =>
    parseDriftThreshold(new URLSearchParams(`${DRIFT_THRESHOLD_PARAM}=${raw}`));

  it("reads a percentage as a 0..1 fraction", () => {
    expect(of("5")).toBe("0.05");
    expect(of("2.5")).toBe("0.025");
    expect(of("2,5")).toBe("0.025");
  });

  it("keeps zero — 'tell me about any drift' is a real choice", () => {
    expect(of("0")).toBe("0");
  });

  it("falls back to the default for junk, negatives and absurd values", () => {
    expect(of("abc")).toBe(DEFAULT_DRIFT_THRESHOLD);
    expect(of("-3")).toBe(DEFAULT_DRIFT_THRESHOLD);
    expect(of("500")).toBe(DEFAULT_DRIFT_THRESHOLD);
    expect(parseDriftThreshold(new URLSearchParams())).toBe(
      DEFAULT_DRIFT_THRESHOLD,
    );
  });
});

describe("buildRebalancePlan", () => {
  const instruments = [
    instrument("A", "Fondo A"),
    instrument("B", "Fondo B"),
    instrument("OLD", "Fondo retirado"),
    instrument("DARK", "Fondo sin precio"),
  ];

  it("splits the contribution across the plan, heaviest slice first", () => {
    const plan = buildRebalancePlan(
      target([
        ["A", "600"],
        ["B", "400"],
      ]),
      [position("A", "1"), position("B", "1")],
      new Map([
        ["A::CORE", priced("400")],
        ["B::CORE", priced("100")],
      ]),
      instruments,
      "200.00",
    );

    expect(plan.rows.map((r) => [r.name, r.amount])).toEqual([
      ["Fondo B", "180"],
      ["Fondo A", "20"],
    ]);
    expect(plan.rows.map((r) => r.share)).toEqual(["0.900000", "0.100000"]);
  });

  it("leaves an unpriced plan line out of the split instead of calling it zero", () => {
    const plan = buildRebalancePlan(
      target([
        ["A", "500"],
        ["DARK", "500"],
      ]),
      [position("A", "1"), position("DARK", "1")],
      new Map([
        ["A::CORE", priced("400")],
        ["DARK::CORE", priced(null)],
      ]),
      instruments,
      "100.00",
    );

    expect(plan.unpriced).toEqual(["Fondo sin precio"]);
    expect(plan.rows.map((r) => r.instrumentId)).toEqual(["A"]);
    expect(plan.rows[0]?.amount).toBe("100");
  });

  it("reports a held position that the plan no longer names, and funds nothing", () => {
    const plan = buildRebalancePlan(
      target([["A", "500"]]),
      [position("A", "1"), position("OLD", "1")],
      new Map([
        ["A::CORE", priced("400")],
        ["OLD::CORE", priced("250")],
      ]),
      instruments,
      "100.00",
    );

    expect(plan.offPlan).toEqual([
      { instrumentId: "OLD", name: "Fondo retirado", value: "250.00" },
    ]);
    expect(plan.rows.map((r) => r.instrumentId)).toEqual(["A"]);
  });

  it("sums the sleeves of one instrument into a single line", () => {
    const plan = buildRebalancePlan(
      target([
        ["A", "500"],
        ["B", "500"],
      ]),
      [
        position("A", "1"),
        { ...position("A", "1"), sleeve: "TRADING" },
        position("B", "1"),
      ],
      new Map([
        ["A::CORE", priced("300")],
        ["A::TRADING", priced("100")],
        ["B::CORE", priced("400")],
      ]),
      instruments,
      "0.00",
    );

    expect(plan.rows.find((r) => r.instrumentId === "A")?.currentValue).toBe(
      "400.00",
    );
    expect(plan.totalDriftBefore).toBe("0.000000");
  });

  it("flags drift over the threshold", () => {
    const plan = buildRebalancePlan(
      target([
        ["A", "500"],
        ["B", "500"],
      ]),
      [position("A", "1"), position("B", "1")],
      new Map([
        ["A::CORE", priced("800")],
        ["B::CORE", priced("200")],
      ]),
      instruments,
      "100.00",
    );

    expect(plan.isOverThreshold).toBe(true);
    expect(Number(plan.totalDriftAfter)).toBeLessThan(
      Number(plan.totalDriftBefore),
    );
  });

  it("judges the drift against the threshold it is given, not a constant", () => {
    // Total drift here is 0.6: over a 2% threshold, well under a 70% one.
    const args = [
      target([
        ["A", "500"],
        ["B", "500"],
      ]),
      [position("A", "1"), position("B", "1")],
      new Map([
        ["A::CORE", priced("800")],
        ["B::CORE", priced("200")],
      ]),
      instruments,
      "100.00",
    ] as const;

    expect(buildRebalancePlan(...args, "0.7").isOverThreshold).toBe(false);
    expect(buildRebalancePlan(...args, "0").isOverThreshold).toBe(true);
    expect(buildRebalancePlan(...args, "0.7").rows).toEqual(
      buildRebalancePlan(...args, "0").rows,
    );
  });

  it("treats a plan line never bought as a full deficit", () => {
    const plan = buildRebalancePlan(
      target([
        ["A", "500"],
        ["B", "500"],
      ]),
      [position("A", "1")],
      new Map([["A::CORE", priced("1000")]]),
      instruments,
      "200.00",
    );

    expect(plan.rows.find((r) => r.instrumentId === "B")?.amount).toBe("200");
    expect(plan.offPlan).toEqual([]);
  });
});
