import { describe, expect, it } from "vitest";

import { Amount } from "./amount";

describe("Amount", () => {
  it("divides by a rate quoted as currency per euro, the ECB's way", () => {
    expect(
      Amount.of("110", "USD").inBase("1.1", "QUOTE_PER_BASE").toString(),
    ).toBe("100");
  });

  it("multiplies by a rate quoted as euros per unit of currency", () => {
    expect(
      Amount.of("100", "USD").inBase("0.9", "BASE_PER_QUOTE").toString(),
    ).toBe("90");
  });

  it("does not round, so a unit price keeps its precision", () => {
    expect(
      Amount.of("0.0123", "USD").inBase("1.1", "QUOTE_PER_BASE").toString(),
    ).toMatch(/^0\.011181818181818181818/);
  });

  it("refuses to convert an amount already in euros", () => {
    expect(() => Amount.of("1", "EUR").inBase("1", "QUOTE_PER_BASE")).toThrow(
      /not converted/,
    );
  });

  it("refuses a value that is not a decimal, like Money", () => {
    expect(() => Amount.of("abc", "USD")).toThrow();
  });

  it("knows whether it is in the base currency", () => {
    expect(Amount.of("1", "EUR").isBase()).toBe(true);
    expect(Amount.of("1", "USD").isBase()).toBe(false);
  });
});
