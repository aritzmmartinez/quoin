import { describe, it, expect } from "vitest";
import {
  ledgerEventSchema,
  ledgerEventWriteSchema,
  decimalString,
  instrumentSchema,
  thesisSchema,
} from "./ledger";

const baseTrade = {
  id: "e1",
  ts: new Date("2025-01-01"),
  type: "BUY" as const,
  instrumentId: "IE00BK5BQT80",
  quantity: "1.5",
  price: "100",
  grossAmount: "150",
  fees: "1",
  currency: "EUR",
  account: "trade-republic",
  source: "TR_CSV",
  externalId: "abc-123",
};

describe("ledger schemas", () => {
  it("parses a valid trade into the right union member", () => {
    const event = ledgerEventSchema.parse(baseTrade);
    expect(event.type).toBe("BUY");
    if (event.type === "BUY") {
      expect(event.quantity).toBe("1.5");
    }
  });

  it("rejects an unknown event type", () => {
    expect(() =>
      ledgerEventSchema.parse({ ...baseTrade, type: "GIFT" }),
    ).toThrow();
  });

  it("rejects a trade with a non-decimal amount", () => {
    expect(() =>
      ledgerEventSchema.parse({ ...baseTrade, grossAmount: "abc" }),
    ).toThrow();
  });

  it("requires an instrument on a trade", () => {
    const { instrumentId: _omitted, ...withoutInstrument } = baseTrade;
    expect(() => ledgerEventSchema.parse(withoutInstrument)).toThrow();
  });

  it("parses a cash event without instrument fields", () => {
    const event = ledgerEventSchema.parse({
      id: "c1",
      ts: new Date("2025-01-02"),
      type: "DEPOSIT",
      grossAmount: "500",
      currency: "EUR",
      account: "trade-republic",
      source: "TR_CSV",
    });
    expect(event.type).toBe("DEPOSIT");
  });

  it("validates decimal strings directly", () => {
    expect(decimalString.safeParse("1234.56").success).toBe(true);
    expect(decimalString.safeParse("not-a-number").success).toBe(false);
  });
});

describe("thesis", () => {
  const baseInstrument = {
    id: "IE00BK5BQT80",
    name: "FTSE All-World",
    type: "ETF" as const,
  };

  it("accepts the three values and nothing else", () => {
    expect(thesisSchema.safeParse("CONVICTION").success).toBe(true);
    expect(thesisSchema.safeParse("TACTICAL").success).toBe(true);
    expect(thesisSchema.safeParse("TRADING").success).toBe(false);
  });

  it("defaults an instrument to CORE rather than leaving it unset", () => {
    expect(instrumentSchema.parse(baseInstrument).thesis).toBe("CORE");
  });

  it("refuses an instrument carrying an unknown thesis", () => {
    expect(() =>
      instrumentSchema.parse({ ...baseInstrument, thesis: "SPECULATIVE" }),
    ).toThrow();
  });
});

describe("ledgerEventWriteSchema", () => {
  const converted = {
    currency: "USD",
    fxSource: "ECB" as const,
    fxDate: "2026-04-02",
    fxRate: "1.1525",
    fxDirection: "QUOTE_PER_BASE" as const,
  };

  it("accepts a euro amount that states no conversion", () => {
    expect(ledgerEventWriteSchema.safeParse(baseTrade).success).toBe(true);
  });

  it("accepts a euro amount booked explicitly as it stands", () => {
    expect(
      ledgerEventWriteSchema.safeParse({ ...baseTrade, fxSource: "IDENTITY" })
        .success,
    ).toBe(true);
  });

  it("accepts an amount in another currency with its rate, direction and day", () => {
    expect(
      ledgerEventWriteSchema.safeParse({ ...baseTrade, ...converted }).success,
    ).toBe(true);
  });

  it.each([
    ["in another currency counted one-to-one", { currency: "USD" }],
    ["already in euros with a rate", { fxRate: "1.1525" }],
    ["in euros claiming a conversion", { ...converted, currency: "EUR" }],
    ["converted with no rate", { ...converted, fxRate: null }],
    ["converted with no direction", { ...converted, fxDirection: null }],
    ["converted with no day", { ...converted, fxDate: null }],
    ["converted at a rate that is not positive", { ...converted, fxRate: "0" }],
    [
      "converted on a day that is not a date",
      { ...converted, fxDate: "2026-02-30" },
    ],
  ])("refuses an event %s", (_case, over) => {
    expect(
      ledgerEventWriteSchema.safeParse({ ...baseTrade, ...over }).success,
    ).toBe(false);
  });

  it.each([
    ["an unknown source", { ...converted, fxSource: "GUESS" }],
    ["an unknown direction", { ...converted, fxDirection: "SIDEWAYS" }],
  ])("refuses %s, at read as well as at write", (_case, over) => {
    const event = { ...baseTrade, ...over };
    expect(ledgerEventSchema.safeParse(event).success).toBe(false);
    expect(ledgerEventWriteSchema.safeParse(event).success).toBe(false);
  });

  it("still reads an old row that breaks the rule, so one bad row cannot take down the ledger", () => {
    const old = { ...baseTrade, currency: "USD", fxSource: "IDENTITY" };
    expect(ledgerEventSchema.safeParse(old).success).toBe(true);
    expect(ledgerEventWriteSchema.safeParse(old).success).toBe(false);
  });
});
