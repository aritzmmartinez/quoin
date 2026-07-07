import { describe, it, expect } from "vitest";
import { mapGroup } from "./map";
import type { KrakenRow } from "./row";

function row(over: Partial<KrakenRow> = {}): KrakenRow {
  return {
    refid: "R1",
    time: "2025-11-13 18:04:48",
    type: "deposit",
    subclass: "fiat",
    asset: "EUR",
    amount: "100",
    fee: "0",
    ...over,
  };
}

describe("Kraken mapGroup", () => {
  it("pairs a spend(EUR)+receive(BTC) into a BUY with derived price", () => {
    const result = mapGroup([
      row({
        refid: "T1",
        type: "spend",
        subclass: "fiat",
        asset: "EUR",
        amount: "-150",
        fee: "0",
      }),
      row({
        refid: "T1",
        type: "receive",
        subclass: "crypto",
        asset: "BTC",
        amount: "0.003",
        fee: "0",
      }),
    ]);
    expect(result.kind).toBe("domain");
    if (result.kind === "domain" && result.event.type === "BUY") {
      expect(result.instrument?.id).toBe("BTC");
      expect(result.event.quantity).toBe("0.003");
      expect(result.event.grossAmount).toBe("150");
      expect(result.event.price).toBe("50000");
      expect(result.event.sleeve).toBe("CORE");
    }
  });

  it("carries the EUR fee from the fiat leg", () => {
    const result = mapGroup([
      row({
        refid: "T2",
        type: "spend",
        subclass: "fiat",
        asset: "EUR",
        amount: "-792.08",
        fee: "7.92",
      }),
      row({
        refid: "T2",
        type: "receive",
        subclass: "crypto",
        asset: "BTC",
        amount: "0.01423507",
        fee: "0",
      }),
    ]);
    expect(
      result.kind === "domain" &&
        result.event.type === "BUY" &&
        result.event.fees,
    ).toBe("7.92");
  });

  it("maps an EUR deposit to a cash DEPOSIT", () => {
    const result = mapGroup([
      row({ refid: "D1", type: "deposit", asset: "EUR", amount: "500" }),
    ]);
    expect(result.kind === "domain" && result.event.type).toBe("DEPOSIT");
  });

  it("models a BTC reward as a zero-cost BUY", () => {
    const result = mapGroup([
      row({
        refid: "RW1",
        type: "reward",
        subclass: "crypto",
        asset: "BTC",
        amount: "0.0000057",
      }),
    ]);
    expect(result.kind).toBe("domain");
    if (result.kind === "domain" && result.event.type === "BUY") {
      expect(result.event.grossAmount).toBe("0");
      expect(result.event.quantity).toBe("0.0000057");
    }
  });

  it("discards non-BTC crypto rewards", () => {
    const sol = mapGroup([
      row({
        refid: "RW2",
        type: "reward",
        subclass: "crypto",
        asset: "SOL",
        amount: "0.5",
      }),
    ]);
    expect(sol).toEqual({ kind: "discard", reason: "non-btc" });
  });

  it("discards crypto-to-crypto swaps", () => {
    const swap = mapGroup([
      row({
        refid: "S1",
        type: "spend",
        subclass: "crypto",
        asset: "PEPE",
        amount: "-629732",
      }),
      row({
        refid: "S1",
        type: "receive",
        subclass: "crypto",
        asset: "SOL",
        amount: "0.02",
      }),
    ]);
    expect(swap).toEqual({ kind: "discard", reason: "non-btc" });
  });
});
