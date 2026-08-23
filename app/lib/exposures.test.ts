import { describe, expect, it } from "vitest";

import type { LeafExposure } from "~/core/projections";

import {
  CONCENTRATION_THRESHOLD,
  DEFAULT_ALLOCATION_VIEW,
  parseAllocationView,
  viewHref,
  readingFor,
  PRESENTATION_THRESHOLD,
  isConcentrated,
  tailOf,
  toExposureRows,
} from "./exposures";

const leaf = (
  id: string,
  value: string,
  kind: LeafExposure["leaf"]["kind"] = "COMPANY",
  contributions = 1,
): LeafExposure => ({
  leaf: { kind, id },
  name: id,
  contributions: Array.from({ length: contributions }, (_, i) => ({
    instrumentId: `parent${i}`,
    instrumentName: id,
    value: (Number(value) / contributions).toFixed(2),
    weightInParent: i === 0 ? null : "0.045",
  })),
});

describe("the two thresholds are different axes", () => {
  it("keeps them apart: presentation is far below concentration", () => {
    expect(Number(PRESENTATION_THRESHOLD)).toBeLessThan(
      Number(CONCENTRATION_THRESHOLD),
    );
  });

  it("flags a leaf above the concentration threshold", () => {
    expect(isConcentrated("0.16")).toBe(true);
    expect(isConcentrated("0.15")).toBe(false);
    expect(isConcentrated("0.02")).toBe(false);
  });

  it("does not flag a leaf whose weight is unknown", () => {
    expect(isConcentrated(null)).toBe(false);
  });
});

describe("toExposureRows", () => {
  it("leaves the long tail out of the rows entirely", () => {
    const rows = toExposureRows(
      [leaf("BIG", "5000"), leaf("SMALL", "10"), leaf("TINY", "5")],
      "10000",
    );
    expect(rows.map((r) => r.key)).toEqual(["COMPANY:BIG"]);
  });

  it("never folds the unresolved leaf, however small", () => {
    const rows = toExposureRows(
      [leaf("BIG", "9999"), leaf("FUND", "1", "UNRESOLVED")],
      "10000",
    );
    expect(rows.map((r) => r.kind)).toContain("UNRESOLVED");
  });

  it("keeps attribution on a real leaf", () => {
    const rows = toExposureRows([leaf("NVDA", "1400", "COMPANY", 3)], "12000");
    expect(rows[0]?.contributions).toHaveLength(3);
    expect(rows[0]?.contributions[0]?.weightInParent).toBeNull();
  });

  it("computes weight against the given total", () => {
    const rows = toExposureRows([leaf("A", "1200")], "12000");
    expect(rows[0]?.weight).toBe("0.100000");
  });

  it("accounts for every euro once the tail is added back", () => {
    const exposures = [
      leaf("A", "5000"),
      leaf("B", "3000"),
      leaf("C", "12"),
      leaf("D", "8"),
      leaf("FUND", "1980", "UNRESOLVED"),
    ];
    const rows = toExposureRows(exposures, "10000");
    const sum = rows.reduce((acc, r) => acc + Number(r.value), 0);
    expect(sum + Number(tailOf(exposures, "10000").value)).toBeCloseTo(
      10000,
      2,
    );
  });

  it("survives a zero total without dividing by it", () => {
    const rows = toExposureRows([leaf("A", "0")], "0");
    expect(rows[0]?.weight).toBeNull();
  });

  it("is empty for no exposures", () => {
    expect(toExposureRows([], "0")).toEqual([]);
  });
});

describe("tailOf", () => {
  it("reports the tail as a fact: how many, how much, what share", () => {
    const tail = tailOf(
      [leaf("BIG", "5000"), leaf("A", "1"), leaf("B", "2")],
      "10000",
    );
    expect(tail).toEqual({ count: 2, value: "3.00", weight: "0.000300" });
  });

  it("does not count the unresolved leaf, which never folds", () => {
    expect(tailOf([leaf("FUND", "1", "UNRESOLVED")], "10000").count).toBe(0);
  });

  it("is empty-safe", () => {
    expect(tailOf([], "0")).toEqual({ count: 0, value: "0.00", weight: null });
  });
});

describe("readingFor", () => {
  const rows = (...leaves: LeafExposure[]) => toExposureRows(leaves, "10000");

  it("reports every leaf analysed, not the handful that fit on screen", () => {
    const reading = readingFor(
      rows(leaf("BIG", "5000"), leaf("SMALL", "1")),
      5029,
    );
    expect(reading?.leafCount).toBe(5029);
  });

  it("names the biggest real leaf and splits it by route", () => {
    const reading = readingFor(rows(leaf("NVDA", "1400", "COMPANY", 2)), 42);
    expect(reading?.name).toBe("NVDA");
    expect(Number(reading?.direct)).toBeGreaterThan(0);
    expect(Number(reading?.via)).toBeGreaterThan(0);
  });

  it("skips the unresolved leaf, which is true but useless as a headline", () => {
    const reading = readingFor(
      rows(leaf("FUND", "9000", "UNRESOLVED"), leaf("REAL", "1000")),
      2,
    );
    expect(reading?.name).toBe("REAL");
  });

  it("flags a leaf over the threshold", () => {
    expect(readingFor(rows(leaf("BIG", "5000")), 1)?.isOver).toBe(true);
    expect(readingFor(rows(leaf("SMALL", "600")), 1)?.isOver).toBe(false);
  });

  it("has nothing to say when there is no real leaf", () => {
    expect(readingFor([], 0)).toBeNull();
    expect(readingFor(rows(leaf("FUND", "9000", "UNRESOLVED")), 1)).toBeNull();
  });
});

describe("parseAllocationView", () => {
  const of = (query: string) => parseAllocationView(new URLSearchParams(query));

  it("reads the view from the URL", () => {
    expect(of("vista=rebalanceo")).toBe("rebalanceo");
    expect(of("vista=exposicion")).toBe("exposicion");
  });

  it("falls back to the reading view for anything else", () => {
    expect(of("")).toBe(DEFAULT_ALLOCATION_VIEW);
    expect(of("vista=")).toBe(DEFAULT_ALLOCATION_VIEW);
    expect(of("vista=Rebalanceo")).toBe(DEFAULT_ALLOCATION_VIEW);
    expect(of("vista=../etc")).toBe(DEFAULT_ALLOCATION_VIEW);
  });
});

describe("viewHref", () => {
  const params = new URLSearchParams("umbral=20&aportacion=500.00&desvio=3");

  it("keeps every other param, so a tab glance costs no state", () => {
    const href = viewHref(params, "rebalanceo");
    expect(new URLSearchParams(href).get("umbral")).toBe("20");
    expect(new URLSearchParams(href).get("aportacion")).toBe("500.00");
    expect(new URLSearchParams(href).get("desvio")).toBe("3");
  });

  it("omits the param for the default view instead of spelling it out", () => {
    expect(viewHref(params, "exposicion")).not.toContain("vista");
    expect(viewHref(params, "rebalanceo")).toContain("vista=rebalanceo");
  });

  it("drops a stale view when returning to the default", () => {
    const away = new URLSearchParams(viewHref(params, "rebalanceo"));
    expect(viewHref(away, "exposicion")).not.toContain("vista");
  });
});
