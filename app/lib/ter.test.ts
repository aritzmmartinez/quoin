import { describe, expect, it } from "vitest";

import { terPercentSchema, type Instrument } from "~/core/domain";

import { terInputMatches, terToPercentInput, toTerRows } from "./ter";

const instrument = (id: string, name: string): Instrument => ({
  id,
  name,
  type: "ETF",
  currency: "EUR",
  assetClass: "FUND",
  quoteSymbol: null,
  exposureKind: null,
  exposureLeafId: null,
  ter: null,
});

describe("terPercentSchema", () => {
  it("reads a percent with an es-ES comma into a fraction", () => {
    expect(terPercentSchema.parse("0,22")).toBe("0.002200");
    expect(terPercentSchema.parse("0.22")).toBe("0.002200");
  });

  it("refuses a fraction typed where a percent was asked for", () => {
    // "0,0022" is 0,0022% — two orders of magnitude low, and it parses. The
    // dangerous direction is the other one and it does not.
    expect(terPercentSchema.safeParse("22").success).toBe(false);
    expect(terPercentSchema.safeParse("5.01").success).toBe(false);
    expect(terPercentSchema.safeParse("-0,1").success).toBe(false);
    expect(terPercentSchema.safeParse("gratis").success).toBe(false);
  });

  it("round-trips through the input the screen shows", () => {
    expect(terToPercentInput(terPercentSchema.parse("0,22"))).toBe("0,22");
    expect(terToPercentInput(null)).toBe("");
    expect(terToPercentInput("")).toBe("");
  });
});

describe("terInputMatches", () => {
  it("matches by parsed value, not by separator or trailing zeros", () => {
    expect(terInputMatches("0,22", "0.002200")).toBe(true);
    expect(terInputMatches("0.22", "0.002200")).toBe(true);
    expect(terInputMatches("0,220", "0.002200")).toBe(true);
    expect(terInputMatches("  0.22  ", "0.002200")).toBe(true);
  });

  it("treats an empty input as matching only an absent stored TER", () => {
    expect(terInputMatches("", null)).toBe(true);
    expect(terInputMatches("   ", null)).toBe(true);
    expect(terInputMatches("", "0.002200")).toBe(false);
    expect(terInputMatches("0,22", null)).toBe(false);
  });

  it("does not match a different value or an unparseable input", () => {
    expect(terInputMatches("0,25", "0.002200")).toBe(false);
    expect(terInputMatches("22", "0.002200")).toBe(false);
    expect(terInputMatches("gratis", "0.002200")).toBe(false);
  });
});

describe("toTerRows", () => {
  it("sorts by annual cost and sinks the unmeasured to the bottom", () => {
    const rows = toTerRows(
      [
        { instrumentId: "A", value: "10000.00", ter: "0.0010" },
        { instrumentId: "B", value: "1000.00", ter: "0.0500" },
        { instrumentId: "C", value: "9000.00", ter: null },
        { instrumentId: "D", value: "0", ter: "0.0030" },
      ],
      [
        instrument("A", "Uno"),
        instrument("B", "Dos"),
        instrument("C", "Tres"),
        instrument("D", "Cuatro"),
      ],
    );

    expect(rows.map((r) => r.instrumentId)).toEqual(["B", "A", "C"]);
    expect(rows[0]?.annualCost).toBe("50.00");
    expect(rows[1]?.annualCost).toBe("10.00");
    expect(rows[2]?.annualCost).toBeNull();
  });
});
