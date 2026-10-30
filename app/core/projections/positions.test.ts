import { describe, it, expect } from "vitest";
import { computePositions } from "./positions";
import type { LedgerEvent, TradeEvent } from "../domain";
import { jurisdictionOf } from "~/core/tax";

const BIZKAIA = jurisdictionOf("bizkaia");

let seq = 0;

function trade(
  type: "BUY" | "SELL",
  instrumentId: string,
  quantity: string,
  grossAmount: string,
  opts: { fees?: string; ts?: string; eurPerUnit?: string } = {},
): TradeEvent {
  return {
    id: `evt-${seq++}`,
    ts: new Date(opts.ts ?? "2025-01-01"),
    type,
    instrumentId,
    quantity,
    price: "0",
    grossAmount,
    fees: opts.fees ?? "0",
    ...(opts.eurPerUnit
      ? {
          currency: "USD",
          fxSource: "ECB" as const,
          fxRate: opts.eurPerUnit,
          fxDirection: "BASE_PER_QUOTE" as const,
          fxDate: "2025-01-01",
        }
      : { currency: "EUR" }),
    account: "test",
    source: "TEST",
  };
}

function only(positions: ReturnType<typeof computePositions>) {
  expect(positions).toHaveLength(1);
  return positions[0]!;
}

describe("computePositions (AVCO)", () => {
  it("returns nothing for an empty ledger", () => {
    expect(computePositions([], BIZKAIA)).toEqual([]);
  });

  it("books a purchase before a sale at the same instant, whatever order the ledger reads them in", () => {
    const opening = trade("BUY", "X", "10", "1000", { ts: "2025-01-01" });
    const at = "2025-02-01T10:00:00Z";
    const sell = trade("SELL", "X", "5", "1000", { ts: at });
    const buy = trade("BUY", "X", "10", "3000", { ts: at });

    for (const events of [
      [opening, sell, buy],
      [opening, buy, sell],
    ]) {
      const p = only(computePositions(events, BIZKAIA));
      expect(p.quantity).toBe("15");
      expect(p.costBasis).toBe("3000");
      expect(p.realizedPnL).toBe("0");
    }
  });

  it("computes weighted-average cost across buys", () => {
    const p = only(
      computePositions(
        [
          trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
          trade("BUY", "X", "10", "2000", { ts: "2025-02-01" }),
        ],
        BIZKAIA,
      ),
    );
    expect(p.quantity).toBe("20");
    expect(p.costBasis).toBe("3000");
    expect(p.averageCost).toBe("150");
    expect(p.realizedPnL).toBe("0");
  });

  it("realizes P&L on a partial sell and keeps the average cost unchanged", () => {
    const p = only(
      computePositions(
        [
          trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
          trade("BUY", "X", "10", "2000", { ts: "2025-02-01" }),
          trade("SELL", "X", "10", "2500", { ts: "2025-03-01" }),
        ],
        BIZKAIA,
      ),
    );
    expect(p.quantity).toBe("10");
    expect(p.costBasis).toBe("1500");
    expect(p.averageCost).toBe("150");
    expect(p.realizedPnL).toBe("1000");
  });

  it("adds buy fees to cost basis and subtracts sell fees from proceeds", () => {
    const buyOnly = only(
      computePositions(
        [trade("BUY", "X", "10", "1000", { fees: "10" })],
        BIZKAIA,
      ),
    );
    expect(buyOnly.costBasis).toBe("1010");
    expect(buyOnly.averageCost).toBe("101");

    const withSell = only(
      computePositions(
        [
          trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
          trade("SELL", "X", "5", "600", { fees: "5", ts: "2025-02-01" }),
        ],
        BIZKAIA,
      ),
    );
    expect(withSell.realizedPnL).toBe("95");
    expect(withSell.quantity).toBe("5");
    expect(withSell.costBasis).toBe("500");
  });

  it("closes a position fully with no cost-basis dust", () => {
    const p = only(
      computePositions(
        [
          trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
          trade("SELL", "X", "10", "1200", { ts: "2025-02-01" }),
        ],
        BIZKAIA,
      ),
    );
    expect(p.quantity).toBe("0");
    expect(p.costBasis).toBe("0");
    expect(p.averageCost).toBe("0");
    expect(p.realizedPnL).toBe("200");
  });

  it("processes events in chronological order regardless of input order", () => {
    const p = only(
      computePositions(
        [
          trade("SELL", "X", "10", "2500", { ts: "2025-03-01" }),
          trade("BUY", "X", "10", "2000", { ts: "2025-02-01" }),
          trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
        ],
        BIZKAIA,
      ),
    );
    expect(p.averageCost).toBe("150");
    expect(p.realizedPnL).toBe("1000");
  });

  it("folds every trade of one instrument into a single position", () => {
    const positions = computePositions(
      [trade("BUY", "X", "10", "1000"), trade("BUY", "X", "10", "2000")],
      BIZKAIA,
    );
    expect(positions).toHaveLength(1);
    const p = only(positions);
    expect(p.quantity).toBe("20");
    expect(p.costBasis).toBe("3000");
    expect(p.averageCost).toBe("150");
  });

  it("groups multiple instruments independently", () => {
    const positions = computePositions(
      [trade("BUY", "X", "10", "1000"), trade("BUY", "Y", "2", "500")],
      BIZKAIA,
    );
    expect(positions).toHaveLength(2);
    expect(positions.find((p) => p.instrumentId === "Y")!.averageCost).toBe(
      "250",
    );
  });

  it("converts amounts to base currency at the rate it was booked at", () => {
    const p = only(
      computePositions(
        [trade("BUY", "X", "10", "1000", { eurPerUnit: "0.9" })],
        BIZKAIA,
      ),
    );
    expect(p.costBasis).toBe("900");
  });

  it("ignores dividends and cash movements", () => {
    const events: LedgerEvent[] = [
      trade("BUY", "X", "10", "1000"),
      {
        id: "d1",
        ts: new Date("2025-02-01"),
        type: "DIVIDEND",
        instrumentId: "X",
        grossAmount: "50",
        taxWithheld: "10",
        currency: "EUR",
        account: "test",
        source: "TEST",
      },
      {
        id: "c1",
        ts: new Date("2025-02-02"),
        type: "DEPOSIT",
        grossAmount: "1000",
        currency: "EUR",
        account: "test",
        source: "TEST",
      },
    ];
    const p = only(computePositions(events, BIZKAIA));
    expect(p.quantity).toBe("10");
    expect(p.costBasis).toBe("1000");
  });
});

describe("an instrument with a trade it cannot convert to euros", () => {
  it("has no position at all, rather than one costed at 1:1", () => {
    const positions = computePositions(
      [
        trade("BUY", "IE00TEST0001", "10", "1000"),
        trade("BUY", "US00TEST0002", "5", "500"),
        { ...trade("BUY", "US00TEST0002", "5", "500"), currency: "USD" },
      ],
      BIZKAIA,
    );
    expect(positions.map((p) => p.instrumentId)).toEqual(["IE00TEST0001"]);
  });
});
