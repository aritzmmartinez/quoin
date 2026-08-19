import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import { deflate, InflationIndex, Money, type TradeEvent } from "../domain";

import { computePositions } from "./positions";
import { computeRealizedGains } from "./realized";
import { realBasis } from "./real";

const point = (period: string, indexValue: string, base = "2025") => ({
  period,
  indexValue,
  base,
});

function buy(
  id: string,
  ts: string,
  quantity: string,
  grossAmount: string,
  fees = "0",
): TradeEvent {
  return {
    id,
    ts: new Date(ts),
    type: "BUY",
    instrumentId: "IE00TEST0001",
    sleeve: "CORE",
    quantity,
    price: new Decimal(grossAmount).div(quantity).toString(),
    grossAmount,
    fees,
    currency: "EUR",
    fxToBase: "1",
    account: "test",
    source: "TEST",
  };
}

function sell(
  id: string,
  ts: string,
  quantity: string,
  grossAmount: string,
  fees = "0",
): TradeEvent {
  return { ...buy(id, ts, quantity, grossAmount, fees), type: "SELL" };
}

const FLAT = InflationIndex.from(
  "ES",
  [2025, 2026].flatMap((year) =>
    Array.from({ length: 12 }, (_, i) =>
      point(`${year}-${String(i + 1).padStart(2, "0")}`, "100.000"),
    ),
  ),
);

const RISING = InflationIndex.from(
  "ES",
  [2025, 2026].flatMap((year) =>
    Array.from({ length: 12 }, (_, i) => {
      const months = (year - 2025) * 12 + i;
      return point(
        `${year}-${String(i + 1).padStart(2, "0")}`,
        new Decimal("100").times(new Decimal("1.0016").pow(months)).toFixed(3),
      );
    }),
  ),
);

describe("realBasis", () => {
  it("is a no-op when the index never moves: real equals nominal", () => {
    const events = [
      buy("1", "2025-02-10T10:00:00Z", "10", "1000", "1"),
      buy("2", "2025-09-10T10:00:00Z", "5", "600", "1"),
      sell("3", "2026-03-10T10:00:00Z", "4", "520", "1"),
    ];

    const basis = realBasis(FLAT, events);
    expect(basis.ok).toBe(true);
    if (!basis.ok) return;

    expect(computePositions(events, basis.revalue)).toEqual(
      computePositions(events),
    );
    expect(computeRealizedGains(events, basis.revalue)).toEqual(
      computeRealizedGains(events),
    );
  });

  it("deflates each contribution at its own date, not the total at one date", () => {
    const events = [
      buy("1", "2025-02-10T10:00:00Z", "10", "1000"),
      buy("2", "2026-08-10T10:00:00Z", "10", "1000"),
    ];

    const basis = realBasis(RISING, events);
    expect(basis.ok).toBe(true);
    if (!basis.ok) return;

    const perFlow = new Decimal(
      computePositions(events, basis.revalue)[0]!.costBasis,
    );

    const totalThenDeflate = new Decimal(
      deflate(
        RISING,
        Money.fromString(computePositions(events)[0]!.costBasis),
        "2025-02",
        basis.reference,
      )!.toString(),
    );

    expect(perFlow.toFixed(2)).not.toBe(totalThenDeflate.toFixed(2));
    expect(perFlow.lessThan(totalThenDeflate)).toBe(true);

    const expected = ["2025-02", "2026-08"].reduce(
      (sum, from) =>
        sum.plus(
          deflate(
            RISING,
            Money.fromString("1000"),
            from,
            basis.reference,
          )!.toString(),
        ),
      new Decimal(0),
    );
    expect(perFlow.toFixed(6)).toBe(expected.toFixed(6));
  });

  it("restates a purchase upward once the index has risen past it", () => {
    const events = [buy("1", "2025-01-10T10:00:00Z", "10", "1000")];
    const basis = realBasis(RISING, events);
    if (!basis.ok) throw new Error("expected a usable basis");

    const real = new Decimal(
      computePositions(events, basis.revalue)[0]!.costBasis,
    );
    expect(real.greaterThan(1000)).toBe(true);
  });

  describe("a hole in the series", () => {
    const holed = InflationIndex.from("ES", [
      point("2025-01", "100.000"),
      point("2025-03", "100.400"),
      point("2026-08", "102.500"),
    ]);

    it("does not pass in silence: it refuses and names the month", () => {
      const events = [
        buy("1", "2025-01-10T10:00:00Z", "10", "1000"),
        buy("2", "2025-02-10T10:00:00Z", "10", "1000"),
      ];

      const basis = realBasis(holed, events);
      expect(basis.ok).toBe(false);
      if (basis.ok) return;
      expect(basis.missing).toEqual(["2025-02"]);
      expect(basis.reference).toBe("2026-08");
    });

    it("refuses for the whole view, not just the affected trade", () => {
      const events = [
        buy("1", "2025-01-10T10:00:00Z", "10", "1000"),
        buy("2", "2025-02-10T10:00:00Z", "10", "1000"),
        buy("3", "2025-03-10T10:00:00Z", "10", "1000"),
      ];
      const basis = realBasis(holed, events);
      expect(basis.ok).toBe(false);
    });

    it("reports every trade period when nothing has ever been synced", () => {
      const events = [
        buy("1", "2025-01-10T10:00:00Z", "10", "1000"),
        buy("2", "2025-04-10T10:00:00Z", "10", "1000"),
      ];
      const basis = realBasis(InflationIndex.from("ES", []), events);
      expect(basis.ok).toBe(false);
      if (basis.ok) return;
      expect(basis.reference).toBeNull();
      expect(basis.missing).toEqual(["2025-01", "2025-04"]);
    });
  });

  it("leaves a trade later than the reference month untouched", () => {
    const index = InflationIndex.from("ES", [
      point("2025-01", "100.000"),
      point("2025-02", "100.200"),
    ]);
    const events = [
      buy("1", "2025-01-10T10:00:00Z", "10", "1000"),
      buy("2", "2025-06-10T10:00:00Z", "10", "1000"),
    ];

    const basis = realBasis(index, events);
    expect(basis.ok).toBe(true);
    if (!basis.ok) return;
    expect(basis.reference).toBe("2025-02");

    const restated = basis.revalue(
      Money.fromString("1000"),
      new Date("2025-06-10T10:00:00Z"),
    );
    expect(restated.toString()).toBe("1000");
  });

  it("uses the Madrid month for a trade on a summer-time month boundary", () => {
    const index = InflationIndex.from("ES", [
      point("2026-03", "100.000"),
      point("2026-04", "110.000"),
    ]);
    const events = [buy("1", "2026-03-31T22:30:00Z", "10", "1000")];

    const basis = realBasis(index, events);
    if (!basis.ok) throw new Error("expected a usable basis");

    expect(computePositions(events, basis.revalue)[0]!.costBasis).toBe("1000");
  });
});
