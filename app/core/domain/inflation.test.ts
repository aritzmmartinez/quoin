import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import { deflate, InflationIndex, Money, periodOf } from "./index";

const point = (period: string, indexValue: string, base = "2025") => ({
  period,
  indexValue,
  base,
});

describe("periodOf", () => {
  it("reads the month in Spanish civil time, not UTC", () => {
    expect(periodOf(new Date("2026-06-15T12:00:00Z"))).toBe("2026-06");
  });

  it("puts a late-night trade on the summer-time month boundary in the next month", () => {
    expect(periodOf(new Date("2026-03-31T22:30:00Z"))).toBe("2026-04");
  });

  it("puts a late-night trade on the winter-time month boundary in the next month", () => {
    expect(periodOf(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11");
  });

  it("keeps the month across the spring-forward switch itself", () => {
    expect(periodOf(new Date("2026-03-29T00:30:00Z"))).toBe("2026-03");
  });

  it("keeps the month across the fall-back switch itself", () => {
    expect(periodOf(new Date("2026-10-25T00:30:00Z"))).toBe("2026-10");
  });

  it("pads the month so periods sort chronologically as strings", () => {
    expect(periodOf(new Date("2026-09-15T12:00:00Z"))).toBe("2026-09");
    expect("2026-09" < "2026-10").toBe(true);
  });
});

describe("InflationIndex", () => {
  it("refuses a series that mixes bases", () => {
    expect(() =>
      InflationIndex.from("ES", [
        point("2025-12", "101.289", "2025"),
        point("2026-01", "84.100", "2030"),
      ]),
    ).toThrow(/mixes bases/);
  });

  it("reports the latest published period", () => {
    const index = InflationIndex.from("ES", [
      point("2026-01", "100.836"),
      point("2025-12", "101.289"),
      point("2026-07", "103.899"),
    ]);
    expect(index.latestPeriod()).toBe("2026-07");
  });

  it("is empty, not broken, with no points", () => {
    const index = InflationIndex.from("ES", []);
    expect(index.latestPeriod()).toBeNull();
    expect(index.size).toBe(0);
    expect(index.has("2026-01")).toBe(false);
  });
});

describe("deflate", () => {
  const index = InflationIndex.from("ES", [
    point("2025-01", "98.579"),
    point("2025-12", "101.289"),
    point("2026-07", "103.899"),
  ]);

  it("restates an old amount in newer euros", () => {
    const restated = deflate(
      index,
      Money.fromString("1000"),
      "2025-01",
      "2026-07",
    );
    expect(new Decimal(restated!.toString()).toFixed(4)).toBe(
      new Decimal("1000").times("103.899").div("98.579").toFixed(4),
    );
  });

  it("leaves an amount alone when both months are the same", () => {
    const restated = deflate(
      index,
      Money.fromString("1234.56"),
      "2026-07",
      "2026-07",
    );
    expect(restated?.toString()).toBe("1234.56");
  });

  it("is its own inverse: deflating then reinflating returns the amount", () => {
    const original = Money.fromString("2750.37");
    const forward = deflate(index, original, "2025-01", "2026-07");
    const back = deflate(index, forward!, "2026-07", "2025-01");
    expect(new Decimal(back!.toString()).toFixed(10)).toBe(
      new Decimal(original.toString()).toFixed(10),
    );
  });

  it("returns null for a month the series does not have", () => {
    expect(
      deflate(index, Money.fromString("100"), "2025-06", "2026-07"),
    ).toBeNull();
    expect(
      deflate(index, Money.fromString("100"), "2025-01", "2026-08"),
    ).toBeNull();
  });
});
