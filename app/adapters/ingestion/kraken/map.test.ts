import { describe, it, expect } from "vitest";
import { mapGroup, priceLookupFrom } from "./map";
import type { KrakenRow } from "./row";

const AT_80K = { price: "80000", currency: "EUR" };

function row(over: Partial<KrakenRow> = {}): KrakenRow {
  return {
    txid: "L1",
    refid: "R1",
    time: "2025-11-13 18:04:48",
    type: "deposit",
    aclass: "currency",
    subclass: "fiat",
    asset: "EUR",
    wallet: "spot / main",
    amount: "100",
    fee: "0",
    balance: "0",
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
    expect(result).toHaveLength(1);
    const [item] = result;
    expect(item!.kind).toBe("domain");
    if (item!.kind === "domain" && item!.event.type === "BUY") {
      expect(item!.instrument?.id).toBe("BTC");
      expect(item!.event.quantity).toBe("0.003");
      expect(item!.event.grossAmount).toBe("150");
      expect(item!.event.price).toBe("50000");
      expect(item!.instrument?.thesis).toBe("CORE");
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
    const [item] = result;
    expect(
      item!.kind === "domain" && item!.event.type === "BUY" && item!.event.fees,
    ).toBe("7.92");
  });

  it("maps an EUR deposit to a cash DEPOSIT", () => {
    const result = mapGroup([
      row({ refid: "D1", type: "deposit", asset: "EUR", amount: "500" }),
    ]);
    const [item] = result;
    expect(item!.kind === "domain" && item!.event.type).toBe("DEPOSIT");
  });

  it("books a BTC purchase paid in another fiat in that currency, for the batch to convert", () => {
    const result = mapGroup([
      row({
        refid: "F1",
        type: "spend",
        subclass: "fiat",
        asset: "USD",
        amount: "-150",
        fee: "1.5",
      }),
      row({
        refid: "F1",
        type: "receive",
        subclass: "crypto",
        asset: "BTC",
        amount: "0.003",
      }),
    ]);
    expect(result).toHaveLength(1);
    const [item] = result;
    expect(item?.kind === "domain" && item.event).toMatchObject({
      type: "BUY",
      instrumentId: "BTC",
      quantity: "0.003",
      price: "50000",
      grossAmount: "150",
      fees: "1.5",
      currency: "USD",
    });
    expect(item?.kind === "domain" && item.event.fxSource).toBeUndefined();
  });

  it("books a BTC sale received in another fiat in that currency", () => {
    const result = mapGroup([
      row({
        refid: "F2",
        type: "spend",
        subclass: "crypto",
        asset: "BTC",
        amount: "-0.003",
      }),
      row({
        refid: "F2",
        type: "receive",
        subclass: "fiat",
        asset: "USD",
        amount: "180",
      }),
    ]);
    const [item] = result;
    expect(item?.kind === "domain" && item.event).toMatchObject({
      type: "SELL",
      grossAmount: "180",
      currency: "USD",
    });
  });

  it.each([
    ["deposit", "DEPOSIT"],
    ["withdrawal", "WITHDRAWAL"],
  ])(
    "books a %s in another fiat as cash in that currency",
    (type, booked) => {
      const [item] = mapGroup([
        row({ refid: "F3", type, asset: "USD", amount: "500" }),
      ]);
      expect(item?.kind === "domain" && item.event).toMatchObject({
        type: booked,
        grossAmount: "500",
        currency: "USD",
      });
    },
  );

  it("treats a stablecoin as crypto, not as fiat", () => {
    const result = mapGroup([
      row({
        refid: "F4",
        type: "spend",
        subclass: "stable_coin",
        asset: "USDG",
        amount: "-150",
      }),
      row({
        refid: "F4",
        type: "receive",
        subclass: "crypto",
        asset: "BTC",
        amount: "0.003",
      }),
    ]);
    expect(result).toEqual([
      {
        kind: "discard",
        reason: "crypto-swap",
        detail: {
          date: "2025-11-13T18:04:48.000Z",
          type: "receive",
          subtype: null,
          instrument: "USDG → BTC",
        },
      },
    ]);
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
    const result = mapGroup([rewardRow()], () => AT_80K);

    expect(result).toHaveLength(2);
    const [buy, income] = result;
    expect(buy!.kind).toBe("domain");
    if (buy!.kind === "domain" && buy!.event.type === "BUY") {
      expect(buy!.event.quantity).toBe("0.0000057");
      expect(buy!.event.price).toBe("80000");
      expect(buy!.event.grossAmount).toBe("0.456");
      expect(buy!.event.fees).toBe("0");
    }
    expect(income!.kind).toBe("domain");
    if (income!.kind === "domain" && income!.event.type === "DIVIDEND") {
      expect(income!.event.instrumentId).toBe("BTC");
      expect(income!.event.grossAmount).toBe("0.456");
      expect(income!.event.externalId).toBe("RW1:income");
    }
  });

  it("marks both legs of a reward as in kind: no money left the bank", () => {
    const [buy, income] = mapGroup([rewardRow()], () => AT_80K);
    for (const item of [buy, income]) {
      expect(item!.kind === "domain" && "funding" in item!.event).toBe(true);
      if (item!.kind === "domain" && "funding" in item!.event)
        expect(item!.event.funding).toBe("IN_KIND");
    }
  });

  it("gives the BUY and the income row distinct externalIds so both survive dedup", () => {
    const [buy, income] = mapGroup([rewardRow()], () => AT_80K);

    expect(buy!.kind === "domain" && buy!.event.externalId).toBe("RW1");
    expect(income!.kind === "domain" && income!.event.externalId).toBe(
      "RW1:income",
    );
  });

  it("keeps a sub-cent reward's value instead of rounding it away", () => {
    const [buy, income] = mapGroup(
      [rewardRow({ amount: "0.00000001" })],
      () => AT_80K,
    );

    expect(
      buy!.kind === "domain" &&
        buy!.event.type === "BUY" &&
        buy!.event.grossAmount,
    ).toBe("0.0008");
    expect(income!.kind === "domain" && income!.event.grossAmount).toBe(
      "0.0008",
    );
  });

  it("discards a reward it cannot price rather than recording a zero cost", () => {
    const result = mapGroup([rewardRow()], () => null);

    expect(result).toEqual([
      {
        kind: "discard",
        reason: "reward-unpriced",
        detail: {
          date: "2025-11-25T23:25:20.000Z",
          type: "reward",
          subtype: null,
          instrument: "BTC",
        },
        instrument: expect.objectContaining({ id: "BTC", type: "CRYPTO" }),
      },
    ]);
  });

  it("brings BTC into the batch even when its only rows are unpriced rewards", () => {
    const [item] = mapGroup([rewardRow()], () => null);

    expect(item?.kind === "discard" && item.instrument?.id).toBe("BTC");
  });

  it("books a reward priced from a history in another currency in that currency", () => {
    const [buy, income] = mapGroup([rewardRow()], () => ({
      price: "90000",
      currency: "USD",
    }));

    for (const item of [buy, income]) {
      expect(item?.kind === "domain" && item.event).toMatchObject({
        grossAmount: "0.513",
        currency: "USD",
      });
    }
  });

  it("prices an earn the same way as a reward", () => {
    const result = mapGroup([rewardRow({ type: "earn" })], () => AT_80K);

    expect(result).toHaveLength(2);
    expect(result[0]!.kind === "domain" && result[0]!.event.type).toBe("BUY");
    expect(result[1]!.kind === "domain" && result[1]!.event.type).toBe(
      "DIVIDEND",
    );
  });

  it("sets aside non-BTC crypto rewards as an asset it does not model", () => {
    const sol = mapGroup([
      row({
        refid: "RW2",
        type: "reward",
        subclass: "crypto",
        asset: "SOL",
        amount: "0.5",
      }),
    ]);
    expect(sol).toEqual([
      {
        kind: "discard",
        reason: "unmodelled-asset",
        detail: {
          date: "2025-11-13T18:04:48.000Z",
          type: "reward",
          subtype: null,
          instrument: "SOL",
        },
      },
    ]);
  });

  it("sets aside a swap between two assets it does not model", () => {
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
    expect(swap).toEqual([
      {
        kind: "discard",
        reason: "unmodelled-asset",
        detail: {
          date: "2025-11-13T18:04:48.000Z",
          type: "receive",
          subtype: null,
          instrument: "PEPE → SOL",
        },
      },
    ]);
  });

  it("discards an unrecognized row type as unsupported, keeping the row", () => {
    const result = mapGroup([
      row({
        refid: "U1",
        time: "2025-11-13 18:04:48",
        type: "staking",
        subclass: "crypto",
        asset: "ETH",
        amount: "0.1",
      }),
    ]);
    expect(result).toEqual([
      {
        kind: "discard",
        reason: "unsupported",
        detail: {
          date: "2025-11-13T18:04:48.000Z",
          type: "staking",
          subtype: null,
          instrument: "ETH",
        },
      },
    ]);
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

  it("takes the close of the last day that has ended", () => {
    const priceAt = priceLookupFrom(history);

    expect(priceAt("BTC", new Date("2025-11-26T05:52:00Z"))).toEqual(AT_80K);
  });

  it("a reward late on day D takes the close of D−1, not D's, which came after it", () => {
    const priceAt = priceLookupFrom(history);

    expect(priceAt("BTC", new Date("2025-11-25T23:25:20Z"))?.price).toBe(
      "79000",
    );
    expect(priceAt("BTC", new Date("2025-11-25T23:59:59Z"))?.price).toBe(
      "79000",
    );
  });

  it("takes a live quote from its own market time", () => {
    const priceAt = priceLookupFrom([
      ...history,
      { ...snapshot("2025-11-25T14:00:00Z", "79500"), source: "YAHOO_LIVE" },
    ]);

    expect(priceAt("BTC", new Date("2025-11-25T15:00:00Z"))?.price).toBe(
      "79500",
    );
    expect(priceAt("BTC", new Date("2025-11-25T13:00:00Z"))?.price).toBe(
      "79000",
    );
  });

  it("carries the close's currency with its price", () => {
    const priceAt = priceLookupFrom([
      { ...snapshot("2025-11-25T00:00:00Z", "90000"), currency: "USD" },
    ]);

    expect(priceAt("BTC", new Date("2025-11-26T12:00:00Z"))).toEqual({
      price: "90000",
      currency: "USD",
    });
  });

  it("never reaches forward for a closer candle", () => {
    const priceAt = priceLookupFrom(history);

    expect(priceAt("BTC", new Date("2025-11-24T23:59:59Z"))).toBeNull();
  });

  it("refuses a close too old to describe that day, counting from when it was known", () => {
    const priceAt = priceLookupFrom([
      snapshot("2025-11-01T00:00:00Z", "70000"),
    ]);

    expect(priceAt("BTC", new Date("2025-11-08T23:00:00Z"))?.price).toBe(
      "70000",
    );
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
      priceLookupFrom(shuffled)("BTC", new Date("2025-11-26T12:00:00Z")),
    ).toEqual(AT_80K);
  });
});
