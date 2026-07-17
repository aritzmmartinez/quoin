import { describe, expect, it } from "vitest";

import type { LeafExposure } from "~/core/projections";

import {
  CONCENTRATION_THRESHOLD,
  PRESENTATION_THRESHOLD,
  isConcentrated,
  tailCount,
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
  it("folds the long tail into one row", () => {
    const rows = toExposureRows(
      [leaf("BIG", "5000"), leaf("SMALL", "10"), leaf("TINY", "5")],
      "10000",
    );
    expect(rows.map((r) => r.key)).toEqual(["COMPANY:BIG", "__tail__"]);
    expect(rows[1]?.value).toBe("15.00");
    expect(rows[1]?.isGrouped).toBe(true);
  });

  it("adds no tail row when nothing falls below the threshold", () => {
    const rows = toExposureRows(
      [leaf("A", "5000"), leaf("B", "5000")],
      "10000",
    );
    expect(rows.every((r) => !r.isGrouped)).toBe(true);
  });

  it("never folds the unresolved leaf, however small", () => {
    const rows = toExposureRows(
      [leaf("BIG", "9999"), leaf("FUND", "1", "UNRESOLVED")],
      "10000",
    );
    expect(rows.map((r) => r.kind)).toContain("UNRESOLVED");
  });

  it("drops attribution on the tail, which has nothing to attribute", () => {
    const rows = toExposureRows(
      [leaf("BIG", "5000"), leaf("SMALL", "1")],
      "10000",
    );
    expect(rows.find((r) => r.isGrouped)?.contributions).toEqual([]);
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

  it("accounts for every euro: rows sum to the total", () => {
    const exposures = [
      leaf("A", "5000"),
      leaf("B", "3000"),
      leaf("C", "12"),
      leaf("D", "8"),
      leaf("FUND", "1980", "UNRESOLVED"),
    ];
    const rows = toExposureRows(exposures, "10000");
    const sum = rows.reduce((acc, r) => acc + Number(r.value), 0);
    expect(sum).toBeCloseTo(10000, 2);
  });

  it("survives a zero total without dividing by it", () => {
    const rows = toExposureRows([leaf("A", "0")], "0");
    expect(rows[0]?.weight).toBeNull();
  });

  it("is empty for no exposures", () => {
    expect(toExposureRows([], "0")).toEqual([]);
  });
});

describe("tailCount", () => {
  it("counts what got folded, for the row's label", () => {
    expect(
      tailCount([leaf("BIG", "5000"), leaf("A", "1"), leaf("B", "2")], "10000"),
    ).toBe(2);
  });

  it("does not count the unresolved leaf, which never folds", () => {
    expect(tailCount([leaf("FUND", "1", "UNRESOLVED")], "10000")).toBe(0);
  });
});
