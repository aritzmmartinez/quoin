import { describe, expect, it } from "vitest";

import { computeCurrencyExposure } from "./currency-exposure";
import type { LeafExposure } from "./exposures";

const leaf = (
  id: string,
  contributions: {
    instrumentId: string;
    value: string;
    weightInParent?: string | null;
  }[],
  kind: LeafExposure["leaf"]["kind"] = "COMPANY",
): LeafExposure => ({
  leaf: { kind, id },
  name: id,
  contributions: contributions.map((c) => ({
    instrumentId: c.instrumentId,
    instrumentName: c.instrumentId,
    value: c.value,
    weightInParent: c.weightInParent ?? null,
  })),
});

const bucketOf = (
  result: ReturnType<typeof computeCurrencyExposure>,
  currency: string | null,
): string | undefined =>
  result.buckets.find((b) => b.currency === currency)?.value;

describe("computeCurrencyExposure", () => {
  it("labels each leaf with the currency of its listing", () => {
    const result = computeCurrencyExposure({
      exposures: [
        leaf("BBG_US", [{ instrumentId: "I1", value: "600.00" }]),
        leaf("BBG_DE", [{ instrumentId: "I2", value: "400.00" }]),
      ],
      currencyByLeaf: new Map([
        ["COMPANY:BBG_US", "USD"],
        ["COMPANY:BBG_DE", "EUR"],
      ]),
      hedgedInstruments: new Set(),
    });

    expect(result.total).toBe("1000");
    expect(result.base).toBe("400");
    expect(result.foreign).toBe("600");
    expect(result.unresolved).toBe("0");
    expect(bucketOf(result, "USD")).toBe("600");
  });

  it("never spreads what it cannot place", () => {
    const result = computeCurrencyExposure({
      exposures: [
        leaf("BBG_US", [{ instrumentId: "I1", value: "700.00" }]),
        leaf("BBG_UNKNOWN", [{ instrumentId: "I2", value: "300.00" }]),
      ],
      currencyByLeaf: new Map([["COMPANY:BBG_US", "USD"]]),
      hedgedInstruments: new Set(),
    });

    expect(bucketOf(result, "USD")).toBe("700");
    expect(result.unresolved).toBe("300");
    expect(result.base).toBe("0");
  });

  it("counts an unresolved fund as unresolved, not as euros", () => {
    const result = computeCurrencyExposure({
      exposures: [
        leaf(
          "FUND1",
          [{ instrumentId: "FUND1", value: "500.00" }],
          "UNRESOLVED",
        ),
      ],
      currencyByLeaf: new Map(),
      hedgedInstruments: new Set(),
    });

    expect(result.unresolved).toBe("500");
    expect(result.base).toBe("0");
  });

  it("keeps the unknown bucket last however large it is", () => {
    const result = computeCurrencyExposure({
      exposures: [
        leaf("BBG_US", [{ instrumentId: "I1", value: "100.00" }]),
        leaf("BBG_X", [{ instrumentId: "I2", value: "900.00" }]),
      ],
      currencyByLeaf: new Map([["COMPANY:BBG_US", "USD"]]),
      hedgedInstruments: new Set(),
    });

    expect(result.buckets.map((b) => b.currency)).toEqual(["USD", null]);
  });

  it("counts a hedged vehicle as base currency whatever its leaf lists in", () => {
    const result = computeCurrencyExposure({
      exposures: [
        leaf("XAU", [{ instrumentId: "GOLD", value: "250.00" }], "COMMODITY"),
      ],
      currencyByLeaf: new Map([["COMMODITY:XAU", "USD"]]),
      hedgedInstruments: new Set(["GOLD"]),
    });

    expect(result.base).toBe("250");
    expect(result.foreign).toBe("0");
  });

  it("splits one leaf when a hedged fund and a direct position both reach it", () => {
    const result = computeCurrencyExposure({
      exposures: [
        leaf("BBG_US", [
          { instrumentId: "DIRECT", value: "300.00" },
          {
            instrumentId: "HEDGED_FUND",
            value: "200.00",
            weightInParent: "0.04",
          },
        ]),
      ],
      currencyByLeaf: new Map([["COMPANY:BBG_US", "USD"]]),
      hedgedInstruments: new Set(["HEDGED_FUND"]),
    });

    expect(bucketOf(result, "USD")).toBe("300");
    expect(result.base).toBe("200");
  });

  it("reports weights against the total, and nothing when there is no total", () => {
    const result = computeCurrencyExposure({
      exposures: [
        leaf("BBG_US", [{ instrumentId: "I1", value: "750.00" }]),
        leaf("BBG_DE", [{ instrumentId: "I2", value: "250.00" }]),
      ],
      currencyByLeaf: new Map([
        ["COMPANY:BBG_US", "USD"],
        ["COMPANY:BBG_DE", "EUR"],
      ]),
      hedgedInstruments: new Set(),
    });
    expect(result.buckets[0]?.weight).toBe("0.750000");

    const empty = computeCurrencyExposure({
      exposures: [],
      currencyByLeaf: new Map(),
      hedgedInstruments: new Set(),
    });
    expect(empty.buckets).toEqual([]);
    expect(empty.total).toBe("0");
  });

  it("carries a negative residual through instead of hiding it", () => {
    const result = computeCurrencyExposure({
      exposures: [
        leaf("BBG_US", [{ instrumentId: "I1", value: "1100.00" }]),
        leaf(
          "FUND1",
          [{ instrumentId: "FUND1", value: "-100.00" }],
          "UNRESOLVED",
        ),
      ],
      currencyByLeaf: new Map([["COMPANY:BBG_US", "USD"]]),
      hedgedInstruments: new Set(),
    });

    expect(result.unresolved).toBe("-100");
    expect(result.total).toBe("1000");
  });

  it("honours a base currency other than the euro", () => {
    const result = computeCurrencyExposure({
      exposures: [leaf("BBG_US", [{ instrumentId: "I1", value: "100.00" }])],
      currencyByLeaf: new Map([["COMPANY:BBG_US", "USD"]]),
      hedgedInstruments: new Set(),
      base: "USD",
    });

    expect(result.base).toBe("100");
    expect(result.foreign).toBe("0");
  });
});
