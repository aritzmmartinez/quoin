import { describe, it, expect } from "vitest";
import {
  ledgerEventSchema,
  decimalString,
  sleeveSchema,
} from "./ledger";

const baseTrade = {
  id: "e1",
  ts: new Date("2025-01-01"),
  type: "BUY" as const,
  instrumentId: "IE00BK5BQT80",
  sleeve: "CORE" as const,
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
    expect(() => ledgerEventSchema.parse({ ...baseTrade, type: "GIFT" })).toThrow();
  });

  it("rejects an invalid sleeve", () => {
    expect(() => ledgerEventSchema.parse({ ...baseTrade, sleeve: "SPECULATIVE" })).toThrow();
  });

  it("rejects a trade with a non-decimal amount", () => {
    expect(() => ledgerEventSchema.parse({ ...baseTrade, grossAmount: "abc" })).toThrow();
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

  it("validates decimal strings and the sleeve enum directly", () => {
    expect(decimalString.safeParse("1234.56").success).toBe(true);
    expect(decimalString.safeParse("not-a-number").success).toBe(false);
    expect(sleeveSchema.safeParse("TRADING").success).toBe(true);
  });
});
