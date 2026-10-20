import { describe, it, expect } from "vitest";

import type {
  CashEvent,
  DividendEvent,
  LedgerEvent,
  TradeEvent,
} from "../domain";
import {
  baseOf,
  bookable,
  hasRate,
  toBase,
  unconvertibleInstrumentIds,
  type BaseAmount,
} from "./to-base";

const trade = (over: Partial<TradeEvent> = {}): TradeEvent => ({
  id: "t1",
  ts: new Date("2026-04-02T10:00:00Z"),
  type: "BUY",
  instrumentId: "US00TEST0001",
  quantity: "10",
  price: "100",
  grossAmount: "1001",
  fees: "1",
  currency: "EUR",
  account: "test",
  source: "TEST",
  ...over,
});

const ecb = (rate: string, direction: TradeEvent["fxDirection"]) => ({
  currency: "USD",
  fxSource: "ECB" as const,
  fxRate: rate,
  fxDirection: direction,
  fxDate: "2026-04-02",
});

const amountOf = (result: BaseAmount) =>
  result.ok ? result.amount.toString() : result.reason;

describe("toBase", () => {
  it("leaves an amount already in euros exactly as it is, sub-cent included", () => {
    const reward = trade({ grossAmount: "0.000456" });
    expect(amountOf(toBase(reward, "grossAmount"))).toBe("0.000456");
  });

  it("divides by a rate quoted as currency per euro, the ECB's way", () => {
    expect(
      amountOf(toBase(trade(ecb("1.1", "QUOTE_PER_BASE")), "grossAmount")),
    ).toBe("910");
  });

  it("multiplies by a rate quoted as euros per unit of currency", () => {
    expect(
      amountOf(toBase(trade(ecb("0.9", "BASE_PER_QUOTE")), "grossAmount")),
    ).toBe("900.9");
  });

  it("rounds a converted amount to the cent, half up", () => {
    const halfCent = trade({ ...ecb("2", "QUOTE_PER_BASE"), fees: "0.01" });
    expect(amountOf(toBase(halfCent, "fees"))).toBe("0.01");
  });

  it("rounds a converted amount under half a cent down to zero", () => {
    const tiny = trade({ ...ecb("2", "QUOTE_PER_BASE"), fees: "0.009" });
    expect(amountOf(toBase(tiny, "fees"))).toBe("0");
  });

  it("rounds each field on its own", () => {
    const event = trade({
      ...ecb("3", "QUOTE_PER_BASE"),
      grossAmount: "100",
      fees: "1",
    });
    expect(amountOf(toBase(event, "grossAmount"))).toBe("33.33");
    expect(amountOf(toBase(event, "fees"))).toBe("0.33");
  });

  it("converts a dividend's withholding like any other field", () => {
    const dividend: DividendEvent = {
      id: "d1",
      ts: new Date("2026-04-02T10:00:00Z"),
      type: "DIVIDEND",
      instrumentId: "US00TEST0001",
      grossAmount: "10",
      taxWithheld: "1.5",
      account: "test",
      source: "TEST",
      ...ecb("1.25", "QUOTE_PER_BASE"),
    };
    expect(amountOf(toBase(dividend, "taxWithheld"))).toBe("1.2");
  });

  it.each([
    [
      "an old row in another currency booked as it stands",
      { currency: "USD" },
    ],
    [
      "a converted row with no rate",
      { ...ecb("1.1", "QUOTE_PER_BASE"), fxRate: null },
    ],
    [
      "a converted row with no direction",
      { ...ecb("1.1", "QUOTE_PER_BASE"), fxDirection: null },
    ],
    [
      "a row in euros that claims a conversion",
      { ...ecb("1.1", "QUOTE_PER_BASE"), currency: "EUR" },
    ],
  ])("answers no rate, never a number, for %s", (_case, over) => {
    const event = trade(over);
    expect(toBase(event, "grossAmount")).toEqual({
      ok: false,
      reason: "no-rate",
    });
    expect(hasRate(event)).toBe(false);
  });
});

describe("baseOf", () => {
  it("returns the euro amount of a row that has a rate", () => {
    expect(baseOf(trade(), "grossAmount").toString()).toBe("1001");
  });

  it("throws on a row with no rate, which bookable() should have kept out", () => {
    expect(() => baseOf(trade({ currency: "USD" }), "grossAmount")).toThrow(
      /bookable/,
    );
  });
});

describe("bookable", () => {
  const cash = (over: Partial<CashEvent> = {}): CashEvent => ({
    id: "c1",
    ts: new Date("2026-04-02T10:00:00Z"),
    type: "DEPOSIT",
    grossAmount: "500",
    currency: "EUR",
    account: "test",
    source: "TEST",
    ...over,
  });

  it("keeps every row of a ledger held in euros", () => {
    const events: LedgerEvent[] = [trade(), cash()];
    expect(bookable(events)).toEqual(events);
    expect(unconvertibleInstrumentIds(events)).toEqual([]);
  });

  it("drops every row of an instrument with a trade it cannot convert, and names it", () => {
    const priced = trade({ id: "a", instrumentId: "IE00TEST0001" });
    const dividend: DividendEvent = {
      id: "d",
      ts: new Date("2026-04-03T10:00:00Z"),
      type: "DIVIDEND",
      instrumentId: "US00TEST0001",
      grossAmount: "5",
      taxWithheld: "0",
      currency: "EUR",
      account: "test",
      source: "TEST",
    };
    const events: LedgerEvent[] = [
      priced,
      trade({ id: "b" }),
      trade({ id: "c", type: "SELL", currency: "USD" }),
      dividend,
    ];

    expect(bookable(events)).toEqual([priced]);
    expect(unconvertibleInstrumentIds(events)).toEqual(["US00TEST0001"]);
  });

  it("drops a cash row it cannot convert on its own, naming no instrument", () => {
    const usd = cash({ id: "c2", currency: "USD" });
    const events: LedgerEvent[] = [trade(), cash(), usd];

    expect(bookable(events).map((e) => e.id)).toEqual(["t1", "c1"]);
    expect(unconvertibleInstrumentIds(events)).toEqual([]);
  });

  it("keeps an instrument whose only row without a rate is a dividend", () => {
    const dividend: DividendEvent = {
      id: "d",
      ts: new Date("2026-04-03T10:00:00Z"),
      type: "DIVIDEND",
      instrumentId: "US00TEST0001",
      grossAmount: "5",
      taxWithheld: "0",
      currency: "USD",
      account: "test",
      source: "TEST",
    };
    const events: LedgerEvent[] = [trade(), dividend];

    expect(bookable(events)).toEqual([trade()]);
    expect(unconvertibleInstrumentIds(events)).toEqual([]);
  });
});
