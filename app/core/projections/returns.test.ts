import { describe, expect, it } from "vitest";

import type { LedgerEvent, TradeEvent } from "../domain";
import {
  computePortfolioReturns,
  computeReturns,
  explainPortfolioTwr,
} from "./returns";

function trade(
  o: Partial<TradeEvent> & Pick<TradeEvent, "ts" | "grossAmount" | "quantity">,
): TradeEvent {
  return {
    id: crypto.randomUUID(),
    type: "BUY",
    instrumentId: "VWCE",
    sleeve: "CORE",
    currency: "EUR",
    fxToBase: "1",
    account: "trade-republic",
    source: "trade-republic",
    price: "0",
    fees: "0",
    ...o,
  };
}

describe("computeReturns", () => {
  it("computes contribution stats from buys", () => {
    const events: LedgerEvent[] = [
      trade({
        ts: new Date("2026-01-01"),
        quantity: "10",
        grossAmount: "1000",
      }),
      trade({ ts: new Date("2026-04-01"), quantity: "5", grossAmount: "600" }),
    ];
    const r = computeReturns(events, "VWCE", "120", new Date("2027-01-01"));
    expect(r.totalInvested).toBe("1600");
    expect(r.buyCount).toBe(2);
    expect(r.avgBuyAmount).toBe("800");
  });

  it("counts fees as part of what was contributed", () => {
    const events: LedgerEvent[] = [
      trade({
        ts: new Date("2026-01-01"),
        quantity: "20",
        grossAmount: "895.40",
        fees: "1",
      }),
    ];
    const r = computeReturns(events, "VWCE", "43.80", new Date("2026-07-15"));

    expect(r.totalInvested).toBe("896.4");
    expect(r.avgBuyAmount).toBe("896.4");
  });

  it("TWR equals the security price return for a continuously held position", () => {
    const events: LedgerEvent[] = [
      trade({
        ts: new Date("2026-01-01"),
        quantity: "10",
        grossAmount: "1000",
      }),
      trade({
        ts: new Date("2026-06-01"),
        quantity: "10",
        grossAmount: "1300",
      }),
    ];
    const r = computeReturns(events, "VWCE", "150", new Date("2027-01-01"));
    expect(r.twr).toBe("0.500000");
  });

  it("MWR ≈ 10% for a single 1000 buy worth 1100 one year later", () => {
    const events: LedgerEvent[] = [
      trade({
        ts: new Date("2026-01-01"),
        quantity: "10",
        grossAmount: "1000",
      }),
    ];
    const r = computeReturns(events, "VWCE", "110", new Date("2027-01-01"));
    expect(Number(r.mwr)).toBeCloseTo(0.1, 3);
  });

  it("TWR and MWR diverge under DCA (big late money on a flat stretch drags MWR down)", () => {
    const events: LedgerEvent[] = [
      trade({ ts: new Date("2026-01-01"), quantity: "1", grossAmount: "100" }),
      trade({
        ts: new Date("2026-12-01"),
        quantity: "100",
        grossAmount: "20000",
      }),
    ];
    const r = computeReturns(events, "VWCE", "200", new Date("2027-01-01"));
    expect(r.twr).toBe("1.000000");
    expect(Number(r.mwr)).toBeLessThan(0.5);
    expect(Number(r.mwr)).toBeGreaterThan(0);
  });

  it("returns null TWR/MWR when there is no current price", () => {
    const events: LedgerEvent[] = [
      trade({
        ts: new Date("2026-01-01"),
        quantity: "10",
        grossAmount: "1000",
      }),
    ];
    const r = computeReturns(events, "VWCE", null, new Date("2027-01-01"));
    expect(r.twr).toBeNull();
    expect(r.mwr).toBeNull();
    expect(r.totalInvested).toBe("1000");
  });
});

const T = (date: string): number => new Date(date).getTime();

function point(date: string, value: string, invested = "0") {
  return { t: T(date), invested, value };
}

describe("computePortfolioReturns", () => {
  it("reports the price return when nothing was added after the first buy", () => {
    const events: LedgerEvent[] = [
      trade({
        ts: new Date("2026-01-01"),
        quantity: "10",
        grossAmount: "1000",
      }),
    ];
    const series = [
      point("2026-01-01", "1000", "1000"),
      point("2027-01-01", "1500", "1000"),
    ];

    const r = computePortfolioReturns(events, series);
    expect(r.twr).toBe("0.500000");
    expect(Number(r.mwr)).toBeCloseTo(0.5, 6);
  });

  it("does not count a contribution as a gain", () => {
    const events: LedgerEvent[] = [
      trade({
        ts: new Date("2026-01-01"),
        quantity: "10",
        grossAmount: "1000",
      }),
      trade({
        ts: new Date("2026-07-01"),
        quantity: "10",
        grossAmount: "1000",
      }),
    ];
    const series = [
      point("2026-01-01", "1000"),
      point("2026-07-01", "2000"),
      point("2027-01-01", "2000"),
    ];

    expect(computePortfolioReturns(events, series).twr).toBe("0.000000");
  });

  it("links sub-period returns across a contribution instead of averaging them", () => {
    const events: LedgerEvent[] = [
      trade({
        ts: new Date("2026-01-01"),
        quantity: "10",
        grossAmount: "1000",
      }),
      trade({ ts: new Date("2026-07-01"), quantity: "8", grossAmount: "1000" }),
    ];
    const series = [
      point("2026-01-01", "1000"),
      point("2026-06-30", "1200"),
      point("2026-07-01", "2200"),
      point("2027-01-01", "2420"),
    ];

    expect(computePortfolioReturns(events, series).twr).toBe("0.320000");
  });

  it("keeps fees out of TWR and inside MWR", () => {
    const events: LedgerEvent[] = [
      trade({
        ts: new Date("2026-01-01"),
        quantity: "10",
        grossAmount: "1000",
        fees: "10",
      }),
    ];
    const series = [point("2026-01-01", "1000"), point("2027-01-01", "1100")];

    const r = computePortfolioReturns(events, series);
    expect(r.twr).toBe("0.100000");
    expect(Number(r.mwr)).toBeCloseTo(0.0891089, 6);
  });

  it("diverges from TWR when the big money arrives late (DCA)", () => {
    const events: LedgerEvent[] = [
      trade({ ts: new Date("2026-01-01"), quantity: "1", grossAmount: "100" }),
      trade({
        ts: new Date("2026-12-01"),
        quantity: "100",
        grossAmount: "20000",
      }),
    ];
    const series = [
      point("2026-01-01", "100"),
      point("2026-12-01", "20200"),
      point("2027-01-01", "20402"),
    ];

    const r = computePortfolioReturns(events, series);
    expect(Number(r.twr)).toBeGreaterThan(1);
    expect(Number(r.mwr)).toBeLessThan(Number(r.twr));
    expect(Number(r.mwr)).toBeGreaterThan(0);
  });

  it("returns nulls with no trades and with no series", () => {
    const events: LedgerEvent[] = [
      trade({
        ts: new Date("2026-01-01"),
        quantity: "10",
        grossAmount: "1000",
      }),
    ];

    expect(computePortfolioReturns(events, [])).toEqual({
      twr: null,
      mwr: null,
    });
    expect(computePortfolioReturns([], [point("2026-01-01", "1000")])).toEqual({
      twr: null,
      mwr: null,
    });
  });

  it("returns a null MWR when every flow points the same way", () => {
    const events: LedgerEvent[] = [
      trade({
        ts: new Date("2026-01-01"),
        quantity: "10",
        grossAmount: "1000",
      }),
    ];
    const series = [point("2026-01-01", "1000"), point("2027-01-01", "0")];

    expect(computePortfolioReturns(events, series).mwr).toBeNull();
  });
});

describe("explainPortfolioTwr", () => {
  const events: LedgerEvent[] = [
    trade({ ts: new Date("2026-01-01"), quantity: "0.0001", grossAmount: "2" }),
    trade({
      ts: new Date("2026-02-01"),
      instrumentId: "VWCE",
      quantity: "100",
      grossAmount: "10000",
    }),
  ];
  const series = [
    point("2026-01-01", "2"),
    point("2026-01-02", "3"),
    point("2026-02-01", "10003"),
    point("2027-01-01", "11003"),
  ];

  it("exposes the denominator of every link", () => {
    const rows = explainPortfolioTwr(events, series);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      startValue: "2",
      flow: "0",
      endValue: "3",
      ratio: "1.5",
    });
    expect(rows[1]).toMatchObject({ startValue: "3", flow: "10000" });
    expect(rows[2]!.startValue).toBe("10003");
  });

  it("shows the two euros driving the headline figure", () => {
    const twr = Number(computePortfolioReturns(events, series).twr);
    expect(twr).toBeGreaterThan(0.6);

    const rows = explainPortfolioTwr(events, series);
    const withoutTheFirst = rows
      .slice(1)
      .reduce((factor, row) => factor * Number(row.ratio), 1);
    expect(withoutTheFirst - 1).toBeCloseTo(0.1, 3);
  });
});
