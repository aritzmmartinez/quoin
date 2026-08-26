import { describe, expect, it } from "vitest";

import type { Sleeve, TradeEvent } from "../domain";

import { computeNetWithCarryforward } from "./carryforward";

let seq = 0;

function trade(
  type: "BUY" | "SELL",
  instrumentId: string,
  quantity: string,
  grossAmount: string,
  opts: { fees?: string; sleeve?: Sleeve; ts?: string } = {},
): TradeEvent {
  return {
    id: `evt-${seq++}`,
    ts: new Date(opts.ts ?? "2025-01-01"),
    type,
    instrumentId,
    sleeve: opts.sleeve ?? "CORE",
    quantity,
    price: "0",
    grossAmount,
    fees: opts.fees ?? "0",
    currency: "EUR",
    fxToBase: "1",
    account: "test",
    source: "TEST",
  };
}

function yearRoundTrip(
  instrumentId: string,
  buyYear: number,
  saleYear: number,
  cost: string,
  proceeds: string,
): TradeEvent[] {
  return [
    trade("BUY", instrumentId, "10", cost, { ts: `${buyYear}-01-01` }),
    trade("SELL", instrumentId, "10", proceeds, { ts: `${saleYear}-06-01` }),
  ];
}

describe("computeNetWithCarryforward", () => {
  it("passes a year through unchanged when nothing was ever negative", () => {
    const events = yearRoundTrip("X", 2026, 2026, "1000", "1300");

    const result = computeNetWithCarryforward(events, 2026);

    expect(result.netSavingsBase).toBe("300");
    expect(result.steps.every((s) => s.consumedFromCarryforward === "0")).toBe(
      true,
    );
  });

  it("carries a realistic sequence of gains and losses oldest-first over 4 years", () => {
    const events = [
      ...yearRoundTrip("A", 2021, 2022, "2000", "1000"), // -1000
      ...yearRoundTrip("B", 2023, 2023, "1000", "1400"), // +400
      ...yearRoundTrip("C", 2024, 2024, "1000", "800"), // -200
      ...yearRoundTrip("D", 2025, 2025, "1000", "1300"), // +300
      ...yearRoundTrip("E", 2026, 2026, "1000", "2000"), // +1000
    ];

    const result = computeNetWithCarryforward(events, 2026);

    expect(result.steps.map((s) => [s.year, s.ownNet, s.finalNet])).toEqual([
      [2022, "-1000", "-1000"],
      [2023, "400", "0"], // 400 of the -1000 consumed
      [2024, "-200", "-200"], // new loss on top of the remaining -600
      [2025, "300", "0"], // consumes 300 of the oldest (2022) remainder
      [2026, "1000", "500"], // consumes the last 300 from 2022, then 200 from 2024
    ]);
    expect(result.steps[4]!.consumedFromCarryforward).toBe("500");
    expect(result.netSavingsBase).toBe("500");
  });

  it("lets a loss older than 4 years expire unused", () => {
    const events = [
      ...yearRoundTrip("A", 2020, 2021, "2000", "1000"), // -1000, in 2021 — 5 years before 2026
      ...yearRoundTrip("B", 2026, 2026, "1000", "1500"), // +500 in the target year
    ];

    const result = computeNetWithCarryforward(events, 2026);

    expect(result.steps[0]!.year).toBe(2022);
    expect(result.netSavingsBase).toBe("500");
  });

  it("never lets pending losses go negative or overshoot the offsetting gain", () => {
    const events = [
      ...yearRoundTrip("A", 2021, 2022, "1000", "700"), // -300
      ...yearRoundTrip("B", 2026, 2026, "1000", "1100"), // +100, less than the loss
    ];

    const result = computeNetWithCarryforward(events, 2026);

    const finalStep = result.steps[result.steps.length - 1]!;
    expect(finalStep.consumedFromCarryforward).toBe("100");
    expect(finalStep.finalNet).toBe("0");
    expect(finalStep.pendingLossRemaining).toBe("200"); // 300 - 100, still available for 2027
  });
});
