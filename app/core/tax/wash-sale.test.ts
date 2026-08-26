import { describe, expect, it } from "vitest";

import type { Sleeve, TradeEvent } from "../domain";

import { findWashSaleTrigger } from "./wash-sale";
import { walkFifo } from "./fifo";

let seq = 0;

function trade(
  type: "BUY" | "SELL",
  instrumentId: string,
  quantity: string,
  grossAmount: string,
  opts: { fees?: string; sleeve?: Sleeve; ts?: string } = {},
): TradeEvent {
  return {
    id: `evt-${seq++}`,
    ts: new Date(opts.ts ?? "2025-01-01"),
    type,
    instrumentId,
    sleeve: opts.sleeve ?? "CORE",
    quantity,
    price: "0",
    grossAmount,
    fees: opts.fees ?? "0",
    currency: "EUR",
    fxToBase: "1",
    account: "test",
    source: "TEST",
  };
}

function saleFor(trades: TradeEvent[], eventId: string) {
  const sale = walkFifo(trades).sales.find((s) => s.trade.id === eventId);
  if (!sale) throw new Error(`no sale for ${eventId}`);
  return sale;
}

describe("findWashSaleTrigger", () => {
  it("flags a loss sale followed by a repurchase within 2 months", () => {
    const buy1 = trade("BUY", "X", "10", "1000", { ts: "2025-01-01" });
    const sell = trade("SELL", "X", "10", "700", { ts: "2025-03-01" });
    const buy2 = trade("BUY", "X", "10", "750", { ts: "2025-04-15" }); // +45 days

    const trades = [buy1, sell, buy2];
    const trigger = findWashSaleTrigger(saleFor(trades, sell.id), trades);

    expect(trigger).not.toBeNull();
    expect(trigger?.buyEventId).toBe(buy2.id);
  });

  it("flags a loss sale preceded by an additional purchase within 2 months", () => {
    const buy1 = trade("BUY", "X", "10", "1000", { ts: "2025-01-01" });
    const buy2 = trade("BUY", "X", "5", "600", { ts: "2025-02-01" }); // extra position
    const sell = trade("SELL", "X", "10", "700", { ts: "2025-03-01" }); // consumes buy1 only

    const trades = [buy1, buy2, sell];
    const trigger = findWashSaleTrigger(saleFor(trades, sell.id), trades);

    expect(trigger?.buyEventId).toBe(buy2.id);
  });

  it("does not flag its own acquisition as a repurchase", () => {
    const buy = trade("BUY", "X", "10", "1000", { ts: "2025-01-01" });
    const sell = trade("SELL", "X", "10", "700", { ts: "2025-02-01" }); // 31 days later

    const trades = [buy, sell];
    const trigger = findWashSaleTrigger(saleFor(trades, sell.id), trades);

    expect(trigger).toBeNull();
  });

  it("does not flag a repurchase outside the 2-month window", () => {
    const buy1 = trade("BUY", "X", "10", "1000", { ts: "2025-01-01" });
    const sell = trade("SELL", "X", "10", "700", { ts: "2025-03-01" });
    const buy2 = trade("BUY", "X", "10", "750", { ts: "2025-06-01" }); // 3 months later

    const trades = [buy1, sell, buy2];
    const trigger = findWashSaleTrigger(saleFor(trades, sell.id), trades);

    expect(trigger).toBeNull();
  });

  it("does not cross instruments or sleeves", () => {
    const buy1 = trade("BUY", "X", "10", "1000", { ts: "2025-01-01" });
    const sell = trade("SELL", "X", "10", "700", { ts: "2025-03-01" });
    const otherInstrument = trade("BUY", "Y", "10", "700", {
      ts: "2025-03-15",
    });
    const otherSleeve = trade("BUY", "X", "10", "700", {
      ts: "2025-03-20",
      sleeve: "TRADING",
    });

    const trades = [buy1, sell, otherInstrument, otherSleeve];
    const trigger = findWashSaleTrigger(saleFor(trades, sell.id), trades);

    expect(trigger).toBeNull();
  });

  it("realistic scenario: a partial loss sale rebought a week later stays disallowed", () => {
    // 2024: buy 20 shares of an ETF. 2025-11: sell 8 at a loss to harvest it
    // for the year, then rebuy 8 the following week — a textbook attempt at
    // the exact thing Art. 47.2 exists to catch.
    const buy1 = trade("BUY", "ETF", "20", "2000", { ts: "2024-06-01" });
    const sell = trade("SELL", "ETF", "8", "640", { ts: "2025-11-10" }); // loss: 800 cost vs 640 proceeds
    const rebuy = trade("BUY", "ETF", "8", "656", { ts: "2025-11-17" });

    const trades = [buy1, sell, rebuy];
    const sale = saleFor(trades, sell.id);
    expect(sale.realizedPnL.isNegative()).toBe(true);

    const trigger = findWashSaleTrigger(sale, trades);
    expect(trigger?.buyEventId).toBe(rebuy.id);
  });
});
