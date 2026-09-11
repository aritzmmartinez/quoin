import { describe, it, expect } from "vitest";
import {
  ledgerEventSchema,
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
  fxToBase: "1",
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
      fxToBase: "1",
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
    currency: "EUR",
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
