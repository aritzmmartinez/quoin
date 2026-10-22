import { describe, expect, it } from "vitest";

import { cryptoInstrumentId } from "./crypto-id";
import { mapGroup } from "./kraken/map";
import type { KrakenRow } from "./kraken/row";
import { mapRow } from "./trade-republic/map";
import type { TradeRepublicRow } from "./trade-republic/row";

const trCryptoBuy: TradeRepublicRow = {
  datetime: "2026-02-03T10:00:00.000Z",
  category: "TRADING",
  type: "BUY",
  asset_class: "CRYPTO",
  name: "Bitcoin",
  symbol: "BTC",
  shares: "0.001",
  price: "60000",
  amount: "-60",
  fee: "",
  tax: "",
  currency: "EUR",
  transaction_id: "tr-1",
};

const krakenBuy: KrakenRow[] = [
  {
    txid: "L1",
    refid: "K1",
    time: "2026-02-04 10:00:00",
    type: "spend",
    aclass: "currency",
    subclass: "fiat",
    asset: "EUR",
    wallet: "spot / main",
    amount: "-60",
    fee: "0",
    balance: "0",
  },
  {
    txid: "L2",
    refid: "K1",
    time: "2026-02-04 10:00:00",
    type: "receive",
    aclass: "currency",
    subclass: "crypto",
    asset: "BTC",
    wallet: "spot / main",
    amount: "0.001",
    fee: "0",
    balance: "0",
  },
];

describe("cryptoInstrumentId", () => {
  it("takes an asset code as the instrument id", () => {
    expect(cryptoInstrumentId("BTC")).toBe("BTC");
    expect(cryptoInstrumentId("USDG")).toBe("USDG");
    expect(cryptoInstrumentId("1INCH")).toBe("1INCH");
  });

  it("refuses what is not an asset code", () => {
    expect(cryptoInstrumentId("")).toBeNull();
    expect(cryptoInstrumentId("btc")).toBeNull();
    expect(cryptoInstrumentId(" BTC")).toBeNull();
    expect(cryptoInstrumentId("BTC-EUR")).toBeNull();
    expect(cryptoInstrumentId("XF000BTC0017")).toBeNull();
  });

  it("gives Trade Republic and Kraken the same instrument for one asset", () => {
    const tr = mapRow(trCryptoBuy);
    const [kraken] = mapGroup(krakenBuy);

    expect(tr.kind).toBe("domain");
    expect(kraken?.kind).toBe("domain");
    if (tr.kind !== "domain" || kraken?.kind !== "domain") return;
    expect(tr.instrument?.id).toBe("BTC");
    expect(kraken.instrument?.id).toBe("BTC");
    expect(tr.event.type === "BUY" && tr.event.instrumentId).toBe("BTC");
    expect(kraken.event.type === "BUY" && kraken.event.instrumentId).toBe(
      "BTC",
    );
    expect(tr.instrument?.type).toBe("CRYPTO");
    expect(kraken.instrument?.type).toBe("CRYPTO");
  });
});
