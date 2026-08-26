import { describe, expect, it } from "vitest";

import { Money } from "../domain";

import { computeSavingsQuota, getTaxScale } from "./config";

describe("getTaxScale", () => {
  it("finds the 2026 Bizkaia scale", () => {
    const scale = getTaxScale("bizkaia", 2026);
    expect(scale?.year).toBe(2026);
    expect(scale?.brackets).toHaveLength(9);
  });

  it("returns null for a year with no recorded scale", () => {
    expect(getTaxScale("bizkaia", 2030)).toBeNull();
  });
});

describe("computeSavingsQuota", () => {
  const scale2026 = getTaxScale("bizkaia", 2026)!;

  it("charges nothing on a zero or negative base", () => {
    expect(computeSavingsQuota(Money.zero(), scale2026).toString()).toBe("0");
    expect(
      computeSavingsQuota(Money.fromString("-500"), scale2026).toString(),
    ).toBe("0");
  });

  it("applies only the first bracket's rate below its ceiling", () => {
    expect(
      computeSavingsQuota(Money.fromString("5000"), scale2026).toString(),
    ).toBe("950"); // 5000 * 0.19
  });

  it("keeps a boundary value fully inside the lower bracket", () => {
    expect(
      computeSavingsQuota(Money.fromString("7500"), scale2026).toString(),
    ).toBe("1425"); // 7500 * 0.19
  });

  it("applies each bracket's rate only to the slice within it", () => {
    expect(
      computeSavingsQuota(Money.fromString("20000"), scale2026).toString(),
    ).toBe("4025");
  });

  it("taxes everything above the top threshold at the top marginal rate", () => {
    expect(
      computeSavingsQuota(Money.fromString("300000"), scale2026).toString(),
    ).toBe("77025");
    expect(
      computeSavingsQuota(Money.fromString("310000"), scale2026).toString(),
    ).toBe("79825"); // 77025 + 10000 * 0.28
  });
});
