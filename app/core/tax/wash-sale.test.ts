import { describe, expect, it } from "vitest";

import type { TradeEvent } from "../domain";

import { toIsoDate } from "../calendar";

import { findWashSaleTrigger, washSaleWindow } from "./wash-sale";
import { walkFifo } from "./fifo";

let seq = 0;

function trade(
  type: "BUY" | "SELL",
  instrumentId: string,
  quantity: string,
  grossAmount: string,
  opts: { fees?: string; ts?: string } = {},
): TradeEvent {
  return {
    id: `evt-${seq++}`,
    ts: new Date(opts.ts ?? "2025-01-01"),
    type,
    instrumentId,
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

  it("does not cross instruments", () => {
    const buy1 = trade("BUY", "X", "10", "1000", { ts: "2025-01-01" });
    const sell = trade("SELL", "X", "10", "700", { ts: "2025-03-01" });
    const otherInstrument = trade("BUY", "Y", "10", "700", {
      ts: "2025-03-15",
    });

    const trades = [buy1, sell, otherInstrument];
    const trigger = findWashSaleTrigger(saleFor(trades, sell.id), trades);

    expect(trigger).toBeNull();
  });

  it("catches a repurchase that a different sleeve used to excuse", () => {
    const buy1 = trade("BUY", "X", "10", "1000", { ts: "2025-01-01" });
    const sell = trade("SELL", "X", "10", "700", { ts: "2025-03-01" });
    const rebuy = trade("BUY", "X", "10", "700", { ts: "2025-03-20" });

    const trades = [buy1, sell, rebuy];
    const trigger = findWashSaleTrigger(saleFor(trades, sell.id), trades);

    expect(trigger?.buyEventId).toBe(rebuy.id);
  });

  it("realistic scenario: a partial loss sale rebought a week later stays disallowed", () => {
    // 2024: buy 20 shares of an ETF. 2025-11: sell 8 at a loss to harvest it
    // for the year, then rebuy 8 the following week — a textbook attempt at
    // the exact thing Art. 43 exists to catch.
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

function tripsOn(saleTs: string, rebuyTs: string): boolean {
  const lot = trade("BUY", "X", "10", "1000", { ts: "2020-01-01T10:00:00Z" });
  const rebuy = trade("BUY", "X", "5", "350", { ts: rebuyTs });
  const sell = trade("SELL", "X", "10", "700", { ts: saleTs });

  const trades = [lot, rebuy, sell];
  const trigger = findWashSaleTrigger(saleFor(trades, sell.id), trades);
  if (trigger !== null) expect(trigger.buyEventId).toBe(rebuy.id);
  return trigger !== null;
}

function windowOf(saleTs: string): string {
  const { start, end } = washSaleWindow(new Date(saleTs));
  return `${toIsoDate(start)}..${toIsoDate(end)}`;
}

describe("washSaleWindow — date to date on Madrid's calendar, bounds inside", () => {
  it("30 April: back to 28 February, not 2 March", () => {
    expect(windowOf("2025-04-30T10:00:00Z")).toBe("2025-02-28..2025-06-30");
    expect(tripsOn("2025-04-30T10:00:00Z", "2025-02-28T10:00:00Z")).toBe(true);
    expect(tripsOn("2025-04-30T10:00:00Z", "2025-02-27T10:00:00Z")).toBe(false);
    expect(tripsOn("2025-04-30T10:00:00Z", "2025-06-30T10:00:00Z")).toBe(true);
    expect(tripsOn("2025-04-30T10:00:00Z", "2025-07-01T10:00:00Z")).toBe(false);
  });

  it("31 December: forward to 28 February, not 3 March", () => {
    expect(windowOf("2025-12-31T10:00:00Z")).toBe("2025-10-31..2026-02-28");
    expect(tripsOn("2025-12-31T10:00:00Z", "2026-02-28T10:00:00Z")).toBe(true);
    expect(tripsOn("2025-12-31T10:00:00Z", "2026-03-01T10:00:00Z")).toBe(false);
    expect(tripsOn("2025-12-31T10:00:00Z", "2025-10-31T10:00:00Z")).toBe(true);
    expect(tripsOn("2025-12-31T10:00:00Z", "2025-10-30T10:00:00Z")).toBe(false);
  });

  it("31 August: back to 30 June, not 1 July", () => {
    expect(windowOf("2025-08-31T10:00:00Z")).toBe("2025-06-30..2025-10-31");
    expect(tripsOn("2025-08-31T10:00:00Z", "2025-06-30T10:00:00Z")).toBe(true);
    expect(tripsOn("2025-08-31T10:00:00Z", "2025-06-29T10:00:00Z")).toBe(false);
    expect(tripsOn("2025-08-31T10:00:00Z", "2025-10-31T10:00:00Z")).toBe(true);
    expect(tripsOn("2025-08-31T10:00:00Z", "2025-11-01T10:00:00Z")).toBe(false);
  });

  it("29 February of a leap year", () => {
    expect(windowOf("2024-02-29T10:00:00Z")).toBe("2023-12-29..2024-04-29");
    expect(tripsOn("2024-02-29T10:00:00Z", "2023-12-29T10:00:00Z")).toBe(true);
    expect(tripsOn("2024-02-29T10:00:00Z", "2023-12-28T10:00:00Z")).toBe(false);
    expect(tripsOn("2024-02-29T10:00:00Z", "2024-04-29T10:00:00Z")).toBe(true);
    expect(tripsOn("2024-02-29T10:00:00Z", "2024-04-30T10:00:00Z")).toBe(false);
  });

  it("29 April of a leap year reaches back to 29 February", () => {
    expect(windowOf("2024-04-29T10:00:00Z")).toBe("2024-02-29..2024-06-29");
    expect(tripsOn("2024-04-29T10:00:00Z", "2024-02-29T10:00:00Z")).toBe(true);
    expect(tripsOn("2024-04-29T10:00:00Z", "2024-02-28T10:00:00Z")).toBe(false);
  });

  it("a boundary repurchase late in the day is still inside", () => {
    expect(tripsOn("2025-06-16T08:00:00Z", "2025-08-16T21:00:00Z")).toBe(true);
    expect(tripsOn("2025-06-16T20:00:00Z", "2025-04-16T05:00:00Z")).toBe(true);
  });

  it("a sale between 22:00 and 24:00 UTC is already the next day in Madrid", () => {
    // 22:30Z on 30 April is 00:30 on 1 May in Madrid (CEST).
    expect(windowOf("2025-04-30T22:30:00Z")).toBe("2025-03-01..2025-07-01");
    expect(tripsOn("2025-04-30T22:30:00Z", "2025-07-01T10:00:00Z")).toBe(true);
    expect(tripsOn("2025-04-30T22:30:00Z", "2025-02-28T10:00:00Z")).toBe(false);
    // 23:30Z on 31 December is 00:30 on 1 January (CET).
    expect(windowOf("2025-12-31T23:30:00Z")).toBe("2025-11-01..2026-03-01");
    expect(tripsOn("2025-12-31T23:30:00Z", "2026-03-01T10:00:00Z")).toBe(true);
    expect(tripsOn("2025-12-31T23:30:00Z", "2025-10-31T10:00:00Z")).toBe(false);
  });

  it("a repurchase between 22:00 and 24:00 UTC is read on Madrid's day too", () => {
    // Window 2025-04-15..2025-08-15.
    expect(windowOf("2025-06-15T10:00:00Z")).toBe("2025-04-15..2025-08-15");
    // 22:30Z on 14 April is 15 April in Madrid: inside.
    expect(tripsOn("2025-06-15T10:00:00Z", "2025-04-14T22:30:00Z")).toBe(true);
    expect(tripsOn("2025-06-15T10:00:00Z", "2025-04-14T21:30:00Z")).toBe(false);
    // 21:30Z on 15 August is still the 15th; 22:30Z is the 16th: outside.
    expect(tripsOn("2025-06-15T10:00:00Z", "2025-08-15T21:30:00Z")).toBe(true);
    expect(tripsOn("2025-06-15T10:00:00Z", "2025-08-15T22:30:00Z")).toBe(false);
  });

  it("around the March clock change", () => {
    // 00:30Z on 30 March 2025 is 01:30 CET, half an hour before the switch.
    expect(windowOf("2025-03-30T00:30:00Z")).toBe("2025-01-30..2025-05-30");
    // 23:30 CET on 29 January = 22:30Z; 00:30 CET on 30 January = 23:30Z.
    expect(tripsOn("2025-03-30T00:30:00Z", "2025-01-29T22:30:00Z")).toBe(false);
    expect(tripsOn("2025-03-30T00:30:00Z", "2025-01-29T23:30:00Z")).toBe(true);
    // 23:30 CEST on 30 May = 21:30Z; 00:30 CEST on 31 May = 22:30Z.
    expect(tripsOn("2025-03-30T00:30:00Z", "2025-05-30T21:30:00Z")).toBe(true);
    expect(tripsOn("2025-03-30T00:30:00Z", "2025-05-30T22:30:00Z")).toBe(false);
    // 23:30Z on 29 March is already 30 March in Madrid (CET, +1).
    expect(windowOf("2025-03-29T23:30:00Z")).toBe("2025-01-30..2025-05-30");
  });

  it("around the October clock change", () => {
    // 22:30Z on 25 October 2025 is 00:30 CEST on the 26th, before the switch.
    expect(windowOf("2025-10-25T22:30:00Z")).toBe("2025-08-26..2025-12-26");
    // 01:30Z on the 26th is 02:30 CET, after it: same day, same window.
    expect(windowOf("2025-10-26T01:30:00Z")).toBe("2025-08-26..2025-12-26");
    // 23:30 CEST on 25 August = 21:30Z; 00:30 CEST on 26 August = 22:30Z.
    expect(tripsOn("2025-10-26T01:30:00Z", "2025-08-25T21:30:00Z")).toBe(false);
    expect(tripsOn("2025-10-26T01:30:00Z", "2025-08-25T22:30:00Z")).toBe(true);
    // 23:59 CET on 26 December = 22:59Z; midnight = 23:00Z.
    expect(tripsOn("2025-10-26T01:30:00Z", "2025-12-26T22:59:00Z")).toBe(true);
    expect(tripsOn("2025-10-26T01:30:00Z", "2025-12-26T23:00:00Z")).toBe(false);
  });
});
