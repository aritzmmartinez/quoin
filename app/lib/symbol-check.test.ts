import { describe, expect, it } from "vitest";

import type { Quote } from "~/core/ports";

import { checkSymbol, heldQuantity } from "./symbol-check";

const NOW = new Date("2026-07-13T12:00:00.000Z");

const quote = (over: Partial<Quote> = {}): Quote => ({
  symbol: "TEST.DE",
  price: "118.420000",
  currency: "EUR",
  asOf: new Date("2026-07-13T09:00:00.000Z"),
  ...over,
});

describe("checkSymbol", () => {
  it("reports the implied value of the position, not just the price", () => {
    const check = checkSymbol(quote(), "12.5", NOW);

    expect(check.impliedValue).toBe("1480.25");
    expect(check.currency).toBe("EUR");
    expect(check.fresh).toBe(true);
    expect(check.closed).toBe(false);
  });

  it("flags a stale market timestamp — the mark of a wrong or illiquid venue", () => {
    const stale = checkSymbol(
      quote({ asOf: new Date("2026-06-01T09:00:00.000Z") }),
      "1",
      NOW,
    );

    expect(stale.fresh).toBe(false);
  });

  it("marks a closed position, where the implied value verifies nothing", () => {
    const check = checkSymbol(quote(), "0", NOW);

    expect(check.closed).toBe(true);
    expect(check.impliedValue).toBe("0.00");
  });

  it("multiplies in decimal, never in floating point", () => {
    const check = checkSymbol(quote({ price: "0.1" }), "0.2", NOW);

    expect(check.impliedValue).toBe("0.02");
  });
});

describe("heldQuantity", () => {
  it("sums every position of the instrument and ignores the rest", () => {
    const positions = [
      { instrumentId: "A", quantity: "1.5" },
      { instrumentId: "B", quantity: "9" },
      { instrumentId: "A", quantity: "2.25" },
    ];

    expect(heldQuantity(positions, "A")).toBe("3.75");
  });

  it("is zero for an instrument with no position", () => {
    expect(heldQuantity([], "A")).toBe("0");
  });
});
