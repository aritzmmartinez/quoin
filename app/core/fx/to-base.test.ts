import { describe, it, expect } from "vitest";

import type { DividendEvent, TradeEvent } from "../domain";
import { toBase } from "./to-base";

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

describe("toBase", () => {
  it("leaves an amount already in euros exactly as it is, sub-cent included", () => {
    const reward = trade({ grossAmount: "0.000456" });
    expect(toBase(reward, "grossAmount").toString()).toBe("0.000456");
  });

  it("divides by a rate quoted as currency per euro, the ECB's way", () => {
    expect(
      toBase(trade(ecb("1.1", "QUOTE_PER_BASE")), "grossAmount").toString(),
    ).toBe("910");
  });

  it("multiplies by a rate quoted as euros per unit of currency", () => {
    expect(
      toBase(trade(ecb("0.9", "BASE_PER_QUOTE")), "grossAmount").toString(),
    ).toBe("900.9");
  });

  it("rounds a converted amount to the cent, half up", () => {
    const halfCent = trade({ ...ecb("2", "QUOTE_PER_BASE"), fees: "0.01" });
    expect(toBase(halfCent, "fees").toString()).toBe("0.01");
  });

  it("rounds a converted amount under half a cent down to zero", () => {
    const tiny = trade({ ...ecb("2", "QUOTE_PER_BASE"), fees: "0.009" });
    expect(toBase(tiny, "fees").toString()).toBe("0");
  });

  it("rounds each field on its own", () => {
    const event = trade({
      ...ecb("3", "QUOTE_PER_BASE"),
      grossAmount: "100",
      fees: "1",
    });
    expect(toBase(event, "grossAmount").toString()).toBe("33.33");
    expect(toBase(event, "fees").toString()).toBe("0.33");
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
    expect(toBase(dividend, "taxWithheld").toString()).toBe("1.2");
  });

  it("still counts an old row in another currency at 1:1, as fxToBase did", () => {
    const legacy = trade({ currency: "USD" });
    expect(toBase(legacy, "grossAmount").toString()).toBe("1001");
  });
});
