import { describe, it, expect } from "vitest";
import { Money } from "./money";

describe("Money", () => {
  it("round-trips a decimal string", () => {
    expect(Money.fromString("1234.56").toString()).toBe("1234.56");
    expect(Money.fromString("0").toString()).toBe("0");
    expect(Money.zero().toString()).toBe("0");
  });

  it("adds without floating-point error (the 0.1 + 0.2 trap)", () => {
    const result = Money.fromString("0.1").add(Money.fromString("0.2"));
    expect(result.toString()).toBe("0.3");
  });

  it("subtracts, negates and scales exactly", () => {
    expect(Money.fromString("3000").subtract(Money.fromString("1500")).toString()).toBe("1500");
    expect(Money.fromString("150").negate().toString()).toBe("-150");
    expect(Money.fromString("150").scaleBy("10").toString()).toBe("1500");
  });

  it("divides to a per-unit amount and rejects division by zero", () => {
    expect(Money.fromString("3000").divideBy("20").toString()).toBe("150");
    expect(() => Money.fromString("100").divideBy("0")).toThrow(/division by zero/);
  });

  it("rejects invalid or non-finite input", () => {
    expect(() => Money.fromString("abc")).toThrow(/Invalid money/);
    expect(() => Money.fromString("")).toThrow(/Invalid money/);
    expect(() => Money.fromString("1.2.3")).toThrow(/Invalid money/);
    expect(() => Money.fromString("Infinity")).toThrow(/finite/);
    expect(() => Money.fromString("NaN")).toThrow(/finite/);
  });

  it("compares and checks sign", () => {
    expect(Money.fromString("10").compare(Money.fromString("20"))).toBe(-1);
    expect(Money.fromString("20").compare(Money.fromString("20"))).toBe(0);
    expect(Money.fromString("30").compare(Money.fromString("20"))).toBe(1);
    expect(Money.fromString("5").equals(Money.fromString("5"))).toBe(true);
    expect(Money.fromString("-1").isNegative()).toBe(true);
    expect(Money.fromString("1").isPositive()).toBe(true);
    expect(Money.zero().isZero()).toBe(true);
  });

  it("formats in es-ES / EUR by default", () => {
    // Normalize any Unicode space (nbsp / narrow nbsp) before the currency symbol.
    const normalize = (s: string) => s.replace(/\u00a0|\u202f/g, " ");
    // Spanish grouping is min2 (CLDR/RAE): 4-digit numbers are NOT grouped,
    // grouping only appears from 5 digits on.
    expect(normalize(Money.fromString("150").format())).toBe("150,00 €");
    expect(normalize(Money.fromString("1234.56").format())).toBe("1234,56 €");
    expect(normalize(Money.fromString("12345.67").format())).toBe("12.345,67 €");
  });
});
