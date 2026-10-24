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
  ])("books a %s in another fiat as cash in that currency", (type, booked) => {
    const [item] = mapGroup([
      row({ refid: "F3", type, asset: "USD", amount: "500" }),
    ]);
    expect(item?.kind === "domain" && item.event).toMatchObject({
      type: booked,
      grossAmount: "500",
      currency: "USD",
    });
  });

  it("treats a stablecoin as crypto, not as fiat: a swap, not a purchase against fiat", () => {
    const result = mapGroup([
      row({
        refid: "F4",
        type: "spend",
        subclass: "stable_coin",
        asset: "USDG",
        amount: "-150",
        amountusd: "-150",
      }),
      row({
        refid: "F4",
        type: "receive",
        subclass: "crypto",
        asset: "BTC",
        amount: "0.003",
        amountusd: "149",
      }),
    ]);
    expect(
      result.map((item) => item.kind === "domain" && item.event),
    ).toMatchObject([
      { type: "SELL", instrumentId: "USDG", linkKind: "swap" },
      { type: "BUY", instrumentId: "BTC", linkKind: "swap" },
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
      expect(buy!.event.note).toBe("kraken-reward");
      expect(buy!.event.valuationSource).toBe("yahoo");
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

  it("prices an earn reward the same way as a reward", () => {
    const result = mapGroup(
      [rewardRow({ type: "earn", subtype: "reward" })],
      () => AT_80K,
    );

    expect(result).toHaveLength(2);
    expect(result[0]!.kind === "domain" && result[0]!.event.type).toBe("BUY");
    expect(result[1]!.kind === "domain" && result[1]!.event.type).toBe(
      "DIVIDEND",
    );
  });

  it.each(["allocation", "deallocation", "migration", "autoallocation"])(
    "never reads an earn %s of BTC as a reward",
    (subtype) => {
      const [item] = mapGroup(
        [rewardRow({ type: "earn", subtype, wallet: "earn / flexible" })],
        () => AT_80K,
      );
      expect(item).toMatchObject({ kind: "discard", reason: "internal-move" });
    },
  );

  it("sets aside an earn row it does not know, never as a reward", () => {
    const [item] = mapGroup(
      [rewardRow({ type: "earn", subtype: "bonus" })],
      () => AT_80K,
    );
    expect(item).toMatchObject({ kind: "discard", reason: "unsupported" });
  });

  it("books a reward in any asset", () => {
    const sol = mapGroup(
      [
        row({
          refid: "RW2",
          type: "reward",
          subtype: "welcomebonus",
          subclass: "crypto",
          asset: "SOL",
          amount: "0.5",
        }),
      ],
      (id) => (id === "SOL" ? { price: "120", currency: "EUR" } : null),
    );
    expect(sol[0]).toMatchObject({
      kind: "domain",
      instrument: { id: "SOL", type: "CRYPTO" },
      event: {
        type: "BUY",
        instrumentId: "SOL",
        quantity: "0.5",
        grossAmount: "60",
        funding: "IN_KIND",
      },
    });
  });

  it("values a reward at Kraken's own figure, net of its fee in the asset", () => {
    const [buy, income] = mapGroup(
      [
        row({
          refid: "E1",
          type: "earn",
          subtype: "reward",
          subclass: "crypto",
          asset: "ETH",
          wallet: "earn / flexible",
          amount: "0.0010",
          fee: "0.0003",
          amountusd: "3.50",
          feeusd: "1.05",
          feecurrency: "ETH",
        }),
      ],
      () => AT_80K,
    );
    expect(buy).toMatchObject({
      kind: "domain",
      event: {
        type: "BUY",
        quantity: "0.0007",
        grossAmount: "2.45",
        price: "3500",
        currency: "USD",
        note: "kraken-reward",
        valuationSource: "kraken-amountusd",
      },
    });
    expect(income).toMatchObject({
      kind: "domain",
      event: { type: "DIVIDEND", grossAmount: "2.45", currency: "USD" },
    });
  });

  it("buys any asset against fiat, net of the fee taken in that asset", () => {
    const [item] = mapGroup([
      row({
        refid: "B2",
        type: "spend",
        asset: "EUR",
        amount: "-20",
        fee: "0.3",
      }),
      row({
        refid: "B2",
        type: "receive",
        subclass: "stable_coin",
        asset: "USDG",
        amount: "23.10",
        fee: "0.10",
      }),
    ]);
    expect(item).toMatchObject({
      kind: "domain",
      instrument: { id: "USDG", type: "CRYPTO" },
      event: {
        type: "BUY",
        instrumentId: "USDG",
        quantity: "23",
        grossAmount: "20",
        fees: "0.3",
        externalId: "B2",
      },
    });
  });

  it("sells any asset against fiat, counting the units its fee took", () => {
    const [item] = mapGroup([
      row({
        refid: "S3",
        type: "spend",
        subclass: "crypto",
        asset: "ETH",
        amount: "-0.5",
        fee: "0.001",
      }),
      row({
        refid: "S3",
        type: "receive",
        asset: "EUR",
        amount: "900",
        fee: "2",
      }),
    ]);
    expect(item).toMatchObject({
      kind: "domain",
      event: {
        type: "SELL",
        instrumentId: "ETH",
        quantity: "0.501",
        grossAmount: "900",
        fees: "2",
      },
    });
  });

  it("sets aside an asset whose code is not one, naming it", () => {
    const [item] = mapGroup([
      row({
        refid: "R9",
        type: "reward",
        subclass: "crypto",
        asset: "eth.s",
        amount: "0.1",
      }),
    ]);
    expect(item).toMatchObject({
      kind: "discard",
      reason: "invalid-crypto-code",
      detail: { instrument: "eth.s" },
    });
  });

  it("books a cash transfer to another account as a withdrawal, and notes it", () => {
    const [cash, note] = mapGroup([
      row({
        refid: "X1",
        type: "transfer",
        subtype: "useraccounttransfer",
        asset: "EUR",
        amount: "-250",
      }),
    ]);
    expect(cash).toMatchObject({
      kind: "domain",
      event: {
        type: "WITHDRAWAL",
        grossAmount: "250",
        note: "kraken-account-transfer",
      },
    });
    expect(note).toMatchObject({ kind: "notice", reason: "account-transfer" });

    const [incoming] = mapGroup([
      row({
        refid: "X2",
        type: "transfer",
        subtype: "useraccounttransfer",
        asset: "EUR",
        amount: "250",
      }),
    ]);
    expect(incoming).toMatchObject({ event: { type: "DEPOSIT" } });
  });

  it("records no event for a move between the user's own wallets", () => {
    const moved = mapGroup([
      row({
        refid: "M1",
        type: "transfer",
        subtype: "spottostaking",
        subclass: "crypto",
        asset: "SOL",
        amount: "-1",
      }),
      row({
        refid: "M1",
        type: "transfer",
        subtype: "stakingfromspot",
        subclass: "crypto",
        asset: "SOL",
        wallet: "earn / bonded",
        amount: "1",
      }),
    ]);
    expect(moved).toMatchObject([{ kind: "discard", reason: "internal-move" }]);
  });

  describe("a swap between two crypto assets", () => {
    const spend = (over: Partial<KrakenRow> = {}) =>
      row({
        refid: "S1",
        type: "spend",
        subclass: "crypto",
        asset: "ETH",
        amount: "-0.05",
        ...over,
      });
    const receive = (over: Partial<KrakenRow> = {}) =>
      row({
        refid: "S1",
        type: "receive",
        subclass: "crypto",
        asset: "BTC",
        amount: "0.0015",
        ...over,
      });
    const events = (items: ReturnType<typeof mapGroup>) =>
      items.map((item) => (item.kind === "domain" ? item.event : item));

    it("is a SELL of what was delivered and a BUY of what was received, linked and valued at Kraken's figure", () => {
      const [sell, buy] = events(
        mapGroup([
          spend({ amountusd: "-165", feeusd: "0" }),
          receive({
            fee: "0.000003",
            amountusd: "163.50",
            feeusd: "0.33",
          }),
        ]),
      );
      expect(sell).toMatchObject({
        type: "SELL",
        instrumentId: "ETH",
        quantity: "0.05",
        price: "3300",
        grossAmount: "165",
        fees: "0",
        currency: "USD",
        externalId: "S1:sell",
        linkId: "S1",
        linkKind: "swap",
        valuationSource: "kraken-amountusd",
      });
      expect(buy).toMatchObject({
        type: "BUY",
        instrumentId: "BTC",
        quantity: "0.001497",
        grossAmount: "163.5",
        fees: "0.33",
        currency: "USD",
        externalId: "S1:buy",
        linkId: "S1",
        linkKind: "swap",
        valuationSource: "kraken-amountusd",
      });
      expect(buy).not.toHaveProperty("funding", "IN_KIND");
    });

    it("counts a fee charged on the delivered leg as delivered: the quantity and the value both include it", () => {
      const [sell, buy] = events(
        mapGroup([
          spend({
            amount: "-0.001",
            fee: "0.00001",
            amountusd: "-110",
            feeusd: "1.10",
          }),
          receive({ asset: "SOL", amount: "0.5", amountusd: "109" }),
        ]),
      );
      expect(sell).toMatchObject({
        quantity: "0.00101",
        grossAmount: "111.1",
        fees: "0",
      });
      expect(buy).toMatchObject({
        quantity: "0.5",
        grossAmount: "109",
        fees: "0",
      });
    });

    it("falls back to the price history, leg by leg, and says so", () => {
      const priceAt = priceLookupFrom([
        {
          instrumentId: "ETH",
          price: "3000",
          currency: "EUR",
          asOf: new Date("2025-11-12T00:00:00Z"),
          source: "YAHOO",
        },
      ]);
      const [sell, buy] = events(
        mapGroup(
          [
            spend(),
            receive({ fee: "0.000003", amountusd: "163.5", feeusd: "0.33" }),
          ],
          priceAt,
        ),
      );
      expect(sell).toMatchObject({
        grossAmount: "150",
        currency: "EUR",
        valuationSource: "yahoo",
      });
      expect(buy).toMatchObject({ valuationSource: "kraken-amountusd" });
    });

    it("does not trust a fee Kraken did not price: that leg falls back to the history", () => {
      const result = mapGroup([
        spend({ amountusd: "-165" }),
        receive({ fee: "0.000003", amountusd: "163.5" }),
      ]);
      expect(result).toMatchObject([
        {
          kind: "discard",
          reason: "swap-unpriced",
          detail: { unpriced: ["BTC"] },
        },
      ]);
    });

    it("sets the whole swap aside when a leg has no value, naming the assets that lack one", () => {
      const swap = mapGroup([
        spend({ asset: "PEPE", amount: "-629732" }),
        receive({ asset: "SOL", amount: "0.02" }),
      ]);
      expect(swap).toMatchObject([
        {
          kind: "discard",
          reason: "swap-unpriced",
          detail: {
            date: "2025-11-13T18:04:48.000Z",
            type: "receive",
            subtype: null,
            instrument: "PEPE → SOL",
            unpriced: ["PEPE", "SOL"],
          },
          instrument: { id: "PEPE" },
          related: [{ id: "SOL" }],
        },
      ]);
      expect(swap).toHaveLength(1);
    });

    it("names only the asset that lacks a value, and writes neither leg", () => {
      const priceAt = priceLookupFrom([
        {
          instrumentId: "ETH",
          price: "3000",
          currency: "EUR",
          asOf: new Date("2025-11-12T00:00:00Z"),
          source: "YAHOO",
        },
      ]);
      const swap = mapGroup([spend(), receive()], priceAt);
      expect(swap).toHaveLength(1);
      expect(swap[0]).toMatchObject({
        kind: "discard",
        reason: "swap-unpriced",
        detail: { unpriced: ["BTC"] },
      });
    });

    it("sets aside a code that is not an asset code, as it does anywhere else", () => {
      const swap = mapGroup([
        spend({ amountusd: "-165" }),
        receive({ asset: "XS00TEST0003", amountusd: "163" }),
      ]);
      expect(swap).toMatchObject([
        { kind: "discard", reason: "invalid-crypto-code" },
      ]);
    });
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
