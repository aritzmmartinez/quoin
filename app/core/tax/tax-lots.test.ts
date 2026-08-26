import { describe, expect, it } from "vitest";

import type { Sleeve, TradeEvent } from "../domain";

import { computeTaxLots, fiscalYearOf } from "./tax-lots";

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

describe("fiscalYearOf", () => {
  it("uses the calendar year in Madrid time, not UTC's", () => {
    expect(fiscalYearOf(new Date("2025-12-31T23:30:00Z"))).toBe(2026);
    expect(fiscalYearOf(new Date("2025-12-31T20:00:00Z"))).toBe(2025);
  });
});

describe("computeTaxLots", () => {
  it("reports an empty year when nothing was sold in it", () => {
    const result = computeTaxLots(
      [trade("BUY", "X", "10", "1000", { ts: "2025-01-01" })],
      2025,
    );
    expect(result.gains).toEqual([]);
    expect(result.allowedNet).toBe("0");
  });

  it("nets a plain gain for the year of the sale", () => {
    const result = computeTaxLots(
      [
        trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
        trade("SELL", "X", "10", "1200", { ts: "2025-06-01" }),
      ],
      2025,
    );

    expect(result.gains).toHaveLength(1);
    const gain = result.gains[0]!;
    expect(gain.realizedPnL).toBe("200");
    expect(gain.disallowed).toBe(false);
    expect(gain.lots).toHaveLength(1);
    expect(result.allowedNet).toBe("200");
  });

  it("only counts a sale in the fiscal year it falls in", () => {
    const events = [
      trade("BUY", "X", "10", "1000", { ts: "2024-01-01" }),
      trade("SELL", "X", "5", "600", { ts: "2025-06-01" }),
      trade("SELL", "X", "5", "700", { ts: "2026-06-01" }),
    ];

    expect(computeTaxLots(events, 2025).gains).toHaveLength(1);
    expect(computeTaxLots(events, 2026).gains).toHaveLength(1);
    expect(computeTaxLots(events, 2024).gains).toHaveLength(0);
  });

  it("allows a loss with no repurchase in window", () => {
    const result = computeTaxLots(
      [
        trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
        trade("SELL", "X", "10", "700", { ts: "2025-06-01" }),
      ],
      2025,
    );

    const gain = result.gains[0]!;
    expect(gain.disallowed).toBe(false);
    expect(result.allowedNet).toBe("-300");
  });

  it("excludes a wash-sale loss from the net but keeps it visible in gains", () => {
    const buy1 = trade("BUY", "X", "10", "1000", { ts: "2025-01-01" });
    const sell = trade("SELL", "X", "10", "700", { ts: "2025-06-01" }); // loss of 300
    const rebuy = trade("BUY", "X", "10", "750", { ts: "2025-07-01" }); // within 2 months

    const result = computeTaxLots([buy1, sell, rebuy], 2025);

    expect(result.gains).toHaveLength(1);
    const gain = result.gains[0]!;
    expect(gain.realizedPnL).toBe("-300");
    expect(gain.disallowed).toBe(true);
    expect(gain.disallowedByBuyEventId).toBe(rebuy.id);
    expect(gain.disallowedReason).not.toBeNull();
    expect(result.allowedNet).toBe("0");
  });

  it("nets multiple sales in the same year, mixing allowed gains and disallowed losses", () => {
    const buyA = trade("BUY", "A", "10", "1000", { ts: "2025-01-01" });
    const sellA = trade("SELL", "A", "10", "700", { ts: "2025-03-01" }); // loss, disallowed
    const rebuyA = trade("BUY", "A", "10", "710", { ts: "2025-04-01" });

    const buyB = trade("BUY", "B", "10", "1000", { ts: "2025-01-01" });
    const sellB = trade("SELL", "B", "10", "1500", { ts: "2025-05-01" }); // gain, allowed

    const result = computeTaxLots([buyA, sellA, rebuyA, buyB, sellB], 2025);

    expect(result.gains).toHaveLength(2);
    expect(result.allowedNet).toBe("500");
  });
});
