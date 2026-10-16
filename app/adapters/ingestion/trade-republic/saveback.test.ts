import { describe, it, expect } from "vitest";

import type { TradeRepublicRow } from "./row";
import { pairSavebacks } from "./saveback";

function row(over: Partial<TradeRepublicRow>): TradeRepublicRow {
  return {
    datetime: "2025-06-02T08:00:00.000Z",
    category: "TRADING",
    type: "BUY",
    asset_class: "FUND",
    name: "Test ETF",
    symbol: "IE00TEST0001",
    shares: "0.01",
    price: "100",
    amount: "-1.00",
    fee: "",
    tax: "",
    currency: "EUR",
    transaction_id: "b1",
    ...over,
  };
}

const saveback = (over: Partial<TradeRepublicRow> = {}) =>
  row({
    category: "CASH",
    type: "BENEFITS_SAVEBACK",
    asset_class: "",
    shares: "",
    price: "",
    amount: "1.000000",
    transaction_id: "s1",
    ...over,
  });

describe("pairSavebacks", () => {
  it("pairs the old regime: gross bought minutes later, retention on the purchase", () => {
    const pairs = pairSavebacks([
      saveback({ datetime: "2025-06-02T08:00:00.000Z" }),
      row({ datetime: "2025-06-02T08:04:00.000Z", tax: "-0.19" }),
    ]);
    expect(pairs).toEqual(new Map([["s1", "b1"]]));
  });

  it("pairs the new regime: net bought the next business day, retention on the saveback, no ISIN", () => {
    const pairs = pairSavebacks([
      saveback({
        datetime: "2026-01-02T05:30:00.000Z",
        name: "",
        symbol: "",
        tax: "-0.190000",
      }),
      row({ datetime: "2026-01-05T09:00:00.000Z", amount: "-0.81" }),
    ]);
    expect(pairs).toEqual(new Map([["s1", "b1"]]));
  });

  it("reaches across a long weekend, up to 7 calendar days and no further", () => {
    const at = (datetime: string) =>
      pairSavebacks([
        saveback({ datetime: "2026-05-01T05:30:00.000Z" }),
        row({ datetime }),
      ]).size;
    expect(at("2026-05-05T09:00:00.000Z")).toBe(1);
    expect(at("2026-05-08T05:30:00.000Z")).toBe(1);
    expect(at("2026-05-08T05:30:00.001Z")).toBe(0);
  });

  it("never pairs a purchase made before the saveback", () => {
    const pairs = pairSavebacks([
      saveback({ datetime: "2025-06-02T08:00:00.000Z" }),
      row({ datetime: "2025-06-02T07:59:59.000Z" }),
    ]);
    expect(pairs.size).toBe(0);
  });

  it("requires the saveback's instrument when it names one", () => {
    const pairs = pairSavebacks([
      saveback(),
      row({ symbol: "IE00TEST0002", datetime: "2025-06-02T08:04:00.000Z" }),
    ]);
    expect(pairs.size).toBe(0);
  });

  it("refuses a saveback with two candidate purchases", () => {
    const pairs = pairSavebacks([
      saveback(),
      row({ transaction_id: "b1", datetime: "2025-06-02T08:04:00.000Z" }),
      row({ transaction_id: "b2", datetime: "2025-06-03T08:04:00.000Z" }),
    ]);
    expect(pairs.size).toBe(0);
  });

  it("refuses both savebacks when one purchase is the only candidate of each", () => {
    const pairs = pairSavebacks([
      saveback({ transaction_id: "s1", datetime: "2025-06-01T08:00:00.000Z" }),
      saveback({ transaction_id: "s2", datetime: "2025-06-02T08:00:00.000Z" }),
      row({ datetime: "2025-06-02T08:04:00.000Z" }),
    ]);
    expect(pairs.size).toBe(0);
  });

  it("counts a row repeated in the file once", () => {
    const buy = row({ datetime: "2025-06-02T08:04:00.000Z" });
    const pairs = pairSavebacks([saveback(), buy, { ...buy }]);
    expect(pairs).toEqual(new Map([["s1", "b1"]]));
  });

  it("does not pair on an amount that differs by a cent", () => {
    const pairs = pairSavebacks([
      saveback({ tax: "-0.19" }),
      row({ datetime: "2025-06-02T08:04:00.000Z", amount: "-0.80" }),
    ]);
    expect(pairs.size).toBe(0);
  });
});
