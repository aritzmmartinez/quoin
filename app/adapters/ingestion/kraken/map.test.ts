import { describe, it, expect } from "vitest";
import { mapGroup, priceLookupFrom } from "./map";
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

  const rewardRow = (over: Partial<KrakenRow> = {}) =>
    row({
      refid: "RW1",
      time: "2025-11-25 23:25:20",
      type: "reward",
      subclass: "crypto",
      asset: "BTC",
      amount: "0.0000057",
      ...over,
    });

  it("values a BTC reward at the market price when it was received", () => {
    const result = mapGroup([rewardRow()], () => "80000");

    expect(result.kind).toBe("domain");
    if (result.kind === "domain" && result.event.type === "BUY") {
      expect(result.event.quantity).toBe("0.0000057");
      expect(result.event.price).toBe("80000");
      expect(result.event.grossAmount).toBe("0.456");
      expect(result.event.fees).toBe("0");
    }
  });

  it("keeps a sub-cent reward's value instead of rounding it away", () => {
    const result = mapGroup(
      [rewardRow({ amount: "0.00000001" })],
      () => "80000",
    );

    expect(
      result.kind === "domain" &&
        result.event.type === "BUY" &&
        result.event.grossAmount,
    ).toBe("0.0008");
  });

  it("discards a reward it cannot price rather than recording a zero cost", () => {
    const result = mapGroup([rewardRow()], () => null);

    expect(result).toEqual({ kind: "discard", reason: "reward-unpriced" });
  });

  it("prices an earn the same way as a reward", () => {
    const result = mapGroup([rewardRow({ type: "earn" })], () => "80000");

    expect(result.kind === "domain" && result.event.type).toBe("BUY");
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

  it("discards crypto-to-crypto swaps as non-BTC", () => {
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

describe("priceLookupFrom", () => {
  const snapshot = (asOf: string, price: string) => ({
    instrumentId: "BTC",
    price,
    currency: "EUR",
    asOf: new Date(asOf),
    source: "YAHOO",
  });

  const history = [
    snapshot("2025-11-24T00:00:00Z", "79000"),
    snapshot("2025-11-25T00:00:00Z", "80000"),
    snapshot("2025-11-26T00:00:00Z", "81000"),
  ];

  it("takes the last close at or before the moment asked for", () => {
    const priceAt = priceLookupFrom(history);

    expect(priceAt("BTC", new Date("2025-11-25T23:25:20Z"))).toBe("80000");
  });

  it("never reaches forward for a closer candle", () => {
    const priceAt = priceLookupFrom(history);

    expect(priceAt("BTC", new Date("2025-11-25T23:59:59Z"))).toBe("80000");
    expect(priceAt("BTC", new Date("2025-11-23T00:00:00Z"))).toBeNull();
  });

  it("refuses a close too old to describe that day", () => {
    const priceAt = priceLookupFrom([
      snapshot("2025-11-01T00:00:00Z", "70000"),
    ]);

    expect(priceAt("BTC", new Date("2025-11-05T00:00:00Z"))).toBe("70000");
    expect(priceAt("BTC", new Date("2025-11-25T00:00:00Z"))).toBeNull();
  });

  it("returns null for an instrument with no history", () => {
    expect(
      priceLookupFrom(history)("SOL", new Date("2025-11-25T00:00:00Z")),
    ).toBeNull();
  });

  it("does not depend on the order snapshots arrive in", () => {
    const shuffled = [history[2]!, history[0]!, history[1]!];

    expect(
      priceLookupFrom(shuffled)("BTC", new Date("2025-11-25T12:00:00Z")),
    ).toBe("80000");
  });
});
