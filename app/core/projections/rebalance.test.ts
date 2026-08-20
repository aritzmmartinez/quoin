import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  computeRebalance,
  type RebalanceLine,
  type RebalanceResult,
} from "./rebalance";

const line = (
  instrumentId: string,
  currentValue: string,
  targetWeight: string,
): RebalanceLine => ({ instrumentId, currentValue, targetWeight });

function sum(result: RebalanceResult): string {
  return result.allocations
    .reduce((total, a) => total.plus(new Decimal(a.amount)), new Decimal(0))
    .toFixed(2);
}

function amountOf(result: RebalanceResult, instrumentId: string): string {
  return (
    result.allocations.find((a) => a.instrumentId === instrumentId)?.amount ??
    "missing"
  );
}

describe("computeRebalance", () => {
  it("sends the whole contribution to the underweight line", () => {
    const result = computeRebalance({
      contribution: "100",
      lines: [line("A", "700", "0.5"), line("B", "300", "0.5")],
    });

    expect(amountOf(result, "A")).toBe("0");
    expect(amountOf(result, "B")).toBe("100");
  });

  it("treats a plan line never bought as all deficit", () => {
    const result = computeRebalance({
      contribution: "200",
      lines: [line("HELD", "1000", "0.5"), line("NEW", "0", "0.5")],
    });

    expect(amountOf(result, "HELD")).toBe("0");
    expect(amountOf(result, "NEW")).toBe("200");
  });

  it("splits proportionally when the contribution cannot fill every deficit", () => {
    const result = computeRebalance({
      contribution: "100",
      lines: [
        line("OVER", "1000", "0.2"),
        line("A", "0", "0.4"),
        line("B", "100", "0.4"),
      ],
    });

    expect(amountOf(result, "OVER")).toBe("0");
    expect(amountOf(result, "A")).toBe("55.81");
    expect(amountOf(result, "B")).toBe("44.19");
    expect(sum(result)).toBe("100.00");
  });

  it("lands every line exactly on its ideal when nothing is overweight", () => {
    const result = computeRebalance({
      contribution: "200",
      lines: [line("A", "400", "0.6"), line("B", "100", "0.4")],
    });

    expect(amountOf(result, "A")).toBe("20");
    expect(amountOf(result, "B")).toBe("180");
    expect(result.totalDriftAfter).toBe("0.000000");
  });

  it("keeps the plan's proportions when the portfolio is already on target", () => {
    const result = computeRebalance({
      contribution: "300",
      lines: [line("A", "600", "0.6"), line("B", "400", "0.4")],
    });

    expect(amountOf(result, "A")).toBe("180");
    expect(amountOf(result, "B")).toBe("120");
    expect(result.totalDriftAfter).toBe("0.000000");
  });

  it("allocates the contribution exactly, to the cent", () => {
    const result = computeRebalance({
      contribution: "100",
      lines: [line("A", "0", "1"), line("B", "0", "1"), line("C", "0", "1")],
    });

    expect(sum(result)).toBe("100.00");
    expect(result.allocations.map((a) => a.amount)).toEqual([
      "33.34",
      "33.33",
      "33.33",
    ]);
  });

  it("never allocates a negative amount", () => {
    const result = computeRebalance({
      contribution: "50",
      lines: [
        line("OVER", "9000", "0.1"),
        line("A", "100", "0.45"),
        line("B", "80", "0.45"),
      ],
    });

    for (const allocation of result.allocations) {
      expect(new Decimal(allocation.amount).isNegative()).toBe(false);
    }
    expect(sum(result)).toBe("50.00");
  });

  it("reports only the lines it was given", () => {
    const result = computeRebalance({
      contribution: "100",
      lines: [line("A", "0", "1")],
    });

    expect(result.allocations.map((a) => a.instrumentId)).toEqual(["A"]);
  });

  it("normalises weights that do not sum to one", () => {
    const result = computeRebalance({
      contribution: "100",
      lines: [line("A", "0", "3"), line("B", "0", "1")],
    });

    expect(amountOf(result, "A")).toBe("75");
    expect(amountOf(result, "B")).toBe("25");
  });

  it("reduces total drift", () => {
    const result = computeRebalance({
      contribution: "400",
      lines: [line("A", "800", "0.5"), line("B", "200", "0.5")],
    });

    expect(
      new Decimal(result.totalDriftAfter).lt(result.totalDriftBefore),
    ).toBe(true);
  });

  it("reads an empty portfolio as fully off-target, not on it", () => {
    const result = computeRebalance({
      contribution: "100",
      lines: [line("A", "0", "0.5"), line("B", "0", "0.5")],
    });

    expect(result.totalDriftBefore).toBe("1.000000");
    expect(result.totalDriftAfter).toBe("0.000000");
  });

  it("gives more to the line that is relatively more underweight", () => {
    const result = computeRebalance({
      contribution: "100",
      lines: [
        line("SHALLOW", "400", "0.25"),
        line("DEEP", "100", "0.25"),
        line("FULL", "800", "0.25"),
        line("FULL2", "800", "0.25"),
      ],
    });

    expect(
      new Decimal(amountOf(result, "DEEP")).gt(amountOf(result, "SHALLOW")),
    ).toBe(true);
    expect(
      new Decimal(amountOf(result, "SHALLOW")).gte(amountOf(result, "FULL")),
    ).toBe(true);
    expect(sum(result)).toBe("100.00");
  });

  it("allocates nothing for a zero contribution and leaves drift untouched", () => {
    const result = computeRebalance({
      contribution: "0",
      lines: [line("A", "800", "0.5"), line("B", "200", "0.5")],
    });

    expect(sum(result)).toBe("0.00");
    expect(result.totalDriftAfter).toBe(result.totalDriftBefore);
  });

  it("places nothing when there is no deficit at all", () => {
    const result = computeRebalance({
      contribution: "0",
      lines: [line("A", "500", "0.5"), line("B", "500", "0.5")],
    });

    expect(result.allocations.map((a) => a.amount)).toEqual(["0", "0"]);
    expect(result.totalDriftBefore).toBe("0.000000");
  });

  it("refuses a negative contribution — it never sells", () => {
    expect(() =>
      computeRebalance({ contribution: "-100", lines: [line("A", "0", "1")] }),
    ).toThrow(/negative/i);
  });

  it("refuses a plan that targets nothing", () => {
    expect(() =>
      computeRebalance({ contribution: "100", lines: [line("A", "0", "0")] }),
    ).toThrow(/zero/i);
  });

  it("has nothing to say without lines", () => {
    expect(computeRebalance({ contribution: "100", lines: [] })).toEqual({
      allocations: [],
      totalDriftBefore: "0",
      totalDriftAfter: "0",
    });
  });
});
