import { describe, expect, it } from "vitest";

import type { LedgerEvent, TradeEvent } from "../domain";
import { computeTradeMeta, tradeMetaKey } from "./trade-meta";

function trade(
  overrides: Partial<TradeEvent> & Pick<TradeEvent, "ts">,
): TradeEvent {
  return {
    id: crypto.randomUUID(),
    type: "BUY",
    instrumentId: "IE00BK5BQT80",
    sleeve: "CORE",
    currency: "EUR",
    fxToBase: "1",
    account: "trade-republic",
    source: "trade-republic",
    quantity: "1",
    price: "100",
    grossAmount: "100",
    fees: "0",
    ...overrides,
  };
}

describe("computeTradeMeta", () => {
  it("tracks first, last and count per instrument+sleeve", () => {
    const events: LedgerEvent[] = [
      trade({ ts: new Date("2026-03-01") }),
      trade({ ts: new Date("2026-01-15"), type: "SELL" }),
      trade({ ts: new Date("2026-05-20") }),
    ];

    const meta = computeTradeMeta(events);
    const entry = meta.get(tradeMetaKey("IE00BK5BQT80", "CORE"));

    expect(entry?.tradeCount).toBe(3);
    expect(entry?.firstTradeAt).toEqual(new Date("2026-01-15"));
    expect(entry?.lastTradeAt).toEqual(new Date("2026-05-20"));
  });

  it("keeps CORE and TRADING sleeves of the same instrument separate", () => {
    const events: LedgerEvent[] = [
      trade({ ts: new Date("2026-01-01"), sleeve: "CORE" }),
      trade({ ts: new Date("2026-02-01"), sleeve: "TRADING" }),
      trade({ ts: new Date("2026-03-01"), sleeve: "TRADING" }),
    ];

    const meta = computeTradeMeta(events);

    expect(meta.get(tradeMetaKey("IE00BK5BQT80", "CORE"))?.tradeCount).toBe(1);
    expect(meta.get(tradeMetaKey("IE00BK5BQT80", "TRADING"))?.tradeCount).toBe(
      2,
    );
  });

  it("ignores non-trade events", () => {
    const events: LedgerEvent[] = [
      {
        id: crypto.randomUUID(),
        type: "DEPOSIT",
        currency: "EUR",
        fxToBase: "1",
        account: "trade-republic",
        source: "trade-republic",
        ts: new Date("2026-01-01"),
        grossAmount: "1000",
      },
    ];

    expect(computeTradeMeta(events).size).toBe(0);
  });
});
