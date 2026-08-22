import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import type { LedgerEvent } from "../domain";
import type { PriceSnapshot } from "../ports";
import type { PriceLike } from "./market-value";
import {
  computeOpportunityCost,
  type OpportunityCostResult,
} from "./opportunity-cost";

const NOW = new Date("2025-08-01T12:00:00Z");

function trade(
  type: "BUY" | "SELL",
  instrumentId: string,
  ts: string,
  quantity: string,
  grossAmount: string,
  fees: string,
): LedgerEvent {
  return {
    id: `${type}-${instrumentId}-${ts}`,
    type,
    ts: new Date(ts),
    instrumentId,
    sleeve: "CORE",
    quantity,
    price: new Decimal(grossAmount).div(quantity).toFixed(),
    grossAmount,
    fees,
    currency: "EUR",
    fxToBase: "1",
    account: "test",
    source: "test",
  };
}

function close(ts: string, price: string): PriceSnapshot {
  return {
    instrumentId: "BENCH",
    price,
    currency: "EUR",
    asOf: new Date(ts),
    source: "test",
  };
}

const HISTORY: PriceSnapshot[] = [
  close("2025-01-15T17:30:00Z", "100"),
  close("2025-01-16T17:30:00Z", "110"),
  close("2025-03-17T17:30:00Z", "125"),
  close("2025-06-02T17:30:00Z", "140"),
  close("2025-08-01T17:30:00Z", "150"),
];

const prices = (entries: Record<string, string>): Map<string, PriceLike> =>
  new Map(
    Object.entries(entries).map(([id, price]) => [
      id,
      { price, currency: "EUR" },
    ]),
  );

function run(
  events: LedgerEvent[],
  priceMap: Map<string, PriceLike>,
  history: PriceSnapshot[] = HISTORY,
): OpportunityCostResult {
  return computeOpportunityCost({
    events,
    benchmarkInstrumentId: "BENCH",
    benchmarkHistory: history,
    prices: priceMap,
    now: NOW,
  });
}

function lineFor(result: OpportunityCostResult, instrumentId: string) {
  return result.lines.find((l) => l.instrumentId === instrumentId);
}

describe("computeOpportunityCost", () => {
  it("returns a zero differential for a portfolio that is only the benchmark", () => {
    const result = run(
      [
        trade("BUY", "BENCH", "2025-01-15T10:00:00Z", "10", "1000", "5"),
        trade("BUY", "BENCH", "2025-03-17T10:00:00Z", "4", "500", "3"),
      ],
      prices({ BENCH: "150" }),
    );

    expect(result.realValue).toBe("2100");
    expect(result.benchmarkValue).toBe("2100");
    expect(result.difference).toBe("0");
    expect(result.realMwr).toBe(result.benchmarkMwr);
    expect(result.mwrDifference).toBe("0.000000");
    expect(result.truncated).toBeNull();
  });

  it("charges the same fees on both sides, so they cancel out of the differential", () => {
    const withFees = run(
      [trade("BUY", "BENCH", "2025-01-15T10:00:00Z", "10", "1000", "40")],
      prices({ BENCH: "150" }),
    );

    expect(withFees.difference).toBe("0");
    expect(withFees.lines[0]?.contributed).toBe("1040");
  });

  it("attributes the difference to each position and the lines sum to the total", () => {
    const result = run(
      [
        trade("BUY", "PICK", "2025-01-15T10:00:00Z", "20", "1000", "5"),
        trade("BUY", "DOG", "2025-03-17T10:00:00Z", "10", "500", "5"),
      ],
      prices({ PICK: "120", DOG: "20" }),
    );

    expect(lineFor(result, "PICK")?.difference).toBe("900");
    expect(lineFor(result, "DOG")?.difference).toBe("-400");
    expect(result.difference).toBe("500");

    const summed = result.lines.reduce(
      (total, l) => total.plus(l.difference),
      new Decimal(0),
    );
    expect(summed.toFixed()).toBe(result.difference);
  });

  it("keeps attributing a position that was sold in full", () => {
    const result = run(
      [
        trade("BUY", "GONE", "2025-01-15T10:00:00Z", "10", "1000", "5"),
        trade("SELL", "GONE", "2025-06-02T10:00:00Z", "10", "1500", "5"),
      ],
      prices({}),
    );

    expect(lineFor(result, "GONE")?.realValue).toBe("1495");
    expect(lineFor(result, "GONE")?.benchmarkValue).toBe("1500");
    expect(result.realizedProceeds).toBe("1495");
    expect(result.unpricedInstrumentIds).toEqual([]);
  });

  it("truncates purchases older than the benchmark history and names them", () => {
    const result = run(
      [
        trade("BUY", "OLD", "2024-11-20T10:00:00Z", "5", "400", "2"),
        trade("BUY", "OLD", "2025-01-15T10:00:00Z", "10", "1000", "5"),
      ],
      prices({ OLD: "100" }),
    );

    expect(result.truncated).toEqual({
      earliestDay: "2025-01-15",
      excludedFlowCount: 1,
      excludedAmount: "402",
    });
    expect(result.benchmarkValue).toBe("1500");
    expect(lineFor(result, "OLD")?.contributed).toBe("1407");
  });

  it("excludes a held position with no usable price from both sides", () => {
    const result = run(
      [
        trade("BUY", "PRICED", "2025-01-15T10:00:00Z", "10", "1000", "5"),
        trade("BUY", "DARK", "2025-01-15T10:00:00Z", "10", "1000", "5"),
      ],
      prices({ PRICED: "150" }),
    );

    expect(result.unpricedInstrumentIds).toEqual(["DARK"]);
    expect(lineFor(result, "DARK")).toBeUndefined();
    expect(result.realValue).toBe("1500");
    expect(result.benchmarkValue).toBe("1500");
  });

  it("treats a quote in another currency as no price at all", () => {
    const result = run(
      [trade("BUY", "USD", "2025-01-15T10:00:00Z", "10", "1000", "5")],
      new Map([["USD", { price: "150", currency: "USD" }]]),
    );

    expect(result.unpricedInstrumentIds).toEqual(["USD"]);
    expect(result.realValue).toBe("0");
  });

  it("buys at the close of the trade's Madrid day, not its UTC day", () => {
    const result = run(
      [trade("BUY", "LATE", "2025-01-15T23:30:00Z", "10", "1100", "0")],
      prices({ LATE: "0" }),
    );

    expect(result.benchmarkValue).toBe("1500");
  });

  it("falls back to the last close before a day the market did not trade", () => {
    const result = run(
      [trade("BUY", "WKND", "2025-03-22T10:00:00Z", "10", "1000", "0")],
      prices({ WKND: "0" }),
    );

    expect(result.benchmarkValue).toBe("1200");
  });

  it("refuses a benchmark with no price history rather than valuing it at zero", () => {
    expect(() =>
      run(
        [trade("BUY", "A", "2025-01-15T10:00:00Z", "10", "1000", "0")],
        prices({}),
        [],
      ),
    ).toThrow(/No EUR price history/);
  });
});
