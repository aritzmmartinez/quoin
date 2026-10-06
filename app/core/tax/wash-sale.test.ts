import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import type { TradeEvent } from "../domain";

import { toIsoDate } from "../calendar";

import {
  createWashSaleAssessor,
  washSaleWindow,
  type UnlistedRepurchaseNotice,
  type WashSaleAssessment,
} from "./wash-sale";
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

function assess(trades: TradeEvent[], unlisted: string[] = []) {
  const assessor = createWashSaleAssessor(trades, new Set(unlisted));
  const bySale = new Map<string, WashSaleAssessment>();
  const notices = new Map<string, UnlistedRepurchaseNotice>();
  for (const sale of walkFifo(trades).sales) {
    if (!sale.realizedPnL.isNegative()) continue;
    if (!assessor.isListed(sale.trade.instrumentId)) {
      const notice = assessor.unlistedNotice(sale);
      if (notice) notices.set(sale.trade.id, notice);
      continue;
    }
    bySale.set(sale.trade.id, assessor.assess(sale));
  }
  return { bySale, notices };
}

function assessmentOf(trades: TradeEvent[], saleId: string) {
  const assessment = assess(trades).bySale.get(saleId);
  if (!assessment) throw new Error(`no assessment for ${saleId}`);
  return {
    before: assessment.before.toFixed(),
    remainingAfter: assessment.remainingAfter.toFixed(),
    repurchaseBefore: assessment.repurchaseBefore.toFixed(),
    repurchaseAfter: assessment.repurchaseAfter.toFixed(),
    repurchased: assessment.repurchased.toFixed(),
    fraction: assessment.fraction.toFixed(4),
    recipients: assessment.recipients.map((r) => [
      r.buyEventId,
      r.quantity.toFixed(),
    ]),
  };
}

describe("assessWashSales — V1403-21, purchases before the sale", () => {
  it("purchases in window consumed by the sale itself, nothing left: no repurchase", () => {
    const buy1 = trade("BUY", "X", "10", "1000", { ts: "2025-01-10" });
    const buy2 = trade("BUY", "X", "5", "500", { ts: "2025-02-01" });
    const sell = trade("SELL", "X", "15", "1200", { ts: "2025-02-15" });

    expect(assessmentOf([buy1, buy2, sell], sell.id)).toMatchObject({
      before: "15",
      remainingAfter: "0",
      repurchaseBefore: "0",
      repurchased: "0",
      recipients: [],
    });
  });

  it("R ≥ purchases in window: all of them count", () => {
    const old = trade("BUY", "X", "20", "2000", { ts: "2024-06-01" });
    const recent = trade("BUY", "X", "5", "500", { ts: "2025-02-01" });
    const sell = trade("SELL", "X", "10", "800", { ts: "2025-03-01" });

    expect(assessmentOf([old, recent, sell], sell.id)).toEqual({
      before: "5",
      remainingAfter: "15",
      repurchaseBefore: "5",
      repurchaseAfter: "0",
      repurchased: "5",
      fraction: "0.5000",
      recipients: [[recent.id, "5"]],
    });
  });

  it("R < purchases in window: only R counts, carried by the units still held", () => {
    const buy1 = trade("BUY", "X", "10", "1000", { ts: "2025-01-10" });
    const buy2 = trade("BUY", "X", "10", "1000", { ts: "2025-02-01" });
    const sell = trade("SELL", "X", "15", "1200", { ts: "2025-03-01" });

    expect(assessmentOf([buy1, buy2, sell], sell.id)).toEqual({
      before: "20",
      remainingAfter: "5",
      repurchaseBefore: "5",
      repurchaseAfter: "0",
      repurchased: "5",
      fraction: "0.3333",
      recipients: [[buy2.id, "5"]],
    });
  });

  it("a purchase in window already sold by an earlier sale does not count", () => {
    const buy = trade("BUY", "X", "10", "1000", { ts: "2025-01-10" });
    const first = trade("SELL", "X", "6", "660", { ts: "2025-01-20" }); // gain
    const second = trade("SELL", "X", "4", "300", { ts: "2025-02-26" }); // loss, nothing left

    expect(assessmentOf([buy, first, second], second.id)).toMatchObject({
      remainingAfter: "0",
      repurchased: "0",
    });
  });

  it("the remainder of a purchase partly consumed by the sale counts", () => {
    const old = trade("BUY", "X", "5", "500", { ts: "2024-06-01" });
    const recent = trade("BUY", "X", "15", "1500", { ts: "2025-02-01" });
    const sell = trade("SELL", "X", "10", "800", { ts: "2025-03-01" }); // 5 old + 5 recent

    expect(assessmentOf([old, recent, sell], sell.id)).toMatchObject({
      before: "15",
      remainingAfter: "10",
      repurchaseBefore: "10",
      repurchased: "10",
      recipients: [[recent.id, "10"]],
    });
  });
});

describe("assessWashSales — V1117-21, purchases after the sale", () => {
  it("is proportional: 3,008 sold at a loss, 2,000 rebought", () => {
    const buy = trade("BUY", "X", "3008", "30080", { ts: "2024-01-15" });
    const sell = trade("SELL", "X", "3008", "24064", { ts: "2025-03-01" });
    const rebuy = trade("BUY", "X", "2000", "16500", { ts: "2025-04-01" });

    const a = assess([buy, sell, rebuy]).bySale.get(sell.id)!;
    expect(a.repurchaseAfter.toFixed()).toBe("2000");
    expect(a.repurchased.toFixed()).toBe("2000");
    expect(new Decimal(3008).minus(a.repurchased).toFixed()).toBe("1008");
    expect(a.fraction.times(3008).toFixed()).toBe("2000");
  });

  it("never counts more than was sold", () => {
    const buy = trade("BUY", "X", "10", "1000", { ts: "2024-01-15" });
    const sell = trade("SELL", "X", "10", "700", { ts: "2025-03-01" });
    const rebuy = trade("BUY", "X", "25", "1800", { ts: "2025-03-20" });

    expect(assessmentOf([buy, sell, rebuy], sell.id)).toMatchObject({
      repurchaseAfter: "25",
      repurchased: "10",
      fraction: "1.0000",
      recipients: [[rebuy.id, "10"]],
    });
  });
});

describe("assessWashSales — scope and allocation", () => {
  it("a purchase in the window of two loss sales repurchases the older one only", () => {
    const buy = trade("BUY", "X", "20", "2000", { ts: "2024-06-01" });
    const first = trade("SELL", "X", "10", "800", { ts: "2025-03-01" });
    const second = trade("SELL", "X", "10", "750", { ts: "2025-03-20" });
    const rebuy = trade("BUY", "X", "10", "700", { ts: "2025-04-10" });

    const trades = [buy, first, second, rebuy];
    expect(assessmentOf(trades, first.id)).toMatchObject({
      repurchased: "10",
      recipients: [[rebuy.id, "10"]],
    });
    expect(assessmentOf(trades, second.id)).toMatchObject({
      repurchaseAfter: "0",
      repurchased: "0",
    });
  });

  it("units held and claimed by an older sale are not claimed again", () => {
    const old = trade("BUY", "X", "10", "1000", { ts: "2024-06-01" });
    const recent = trade("BUY", "X", "10", "1000", { ts: "2025-02-01" });
    const first = trade("SELL", "X", "10", "800", { ts: "2025-03-01" }); // old lot; recent held
    const second = trade("SELL", "X", "5", "400", { ts: "2025-03-10" }); // 5 of recent; 5 held

    const trades = [old, recent, first, second];
    expect(assessmentOf(trades, first.id)).toMatchObject({
      repurchased: "10",
      recipients: [[recent.id, "10"]],
    });
    expect(assessmentOf(trades, second.id)).toMatchObject({
      before: "0",
      remainingAfter: "5",
      repurchased: "0",
    });
  });

  it("a window across the new year: sale in December, rebuy in January", () => {
    const buy = trade("BUY", "X", "10", "1000", { ts: "2025-03-01" });
    const sell = trade("SELL", "X", "10", "700", {
      ts: "2025-12-15T10:00:00Z",
    });
    const rebuy = trade("BUY", "X", "10", "720", {
      ts: "2026-01-20T10:00:00Z",
    });

    expect(assessmentOf([buy, sell, rebuy], sell.id)).toMatchObject({
      repurchaseAfter: "10",
      repurchased: "10",
      recipients: [[rebuy.id, "10"]],
    });
  });

  it("same day: before or after is decided by the instant", () => {
    const old = trade("BUY", "X", "10", "1000", { ts: "2024-06-01T09:00:00Z" });
    const morning = trade("BUY", "X", "4", "320", {
      ts: "2025-05-08T08:00:00Z",
    });
    const sell = trade("SELL", "X", "10", "800", {
      ts: "2025-05-08T12:00:00Z",
    });
    const evening = trade("BUY", "X", "3", "240", {
      ts: "2025-05-08T16:00:00Z",
    });

    expect(assessmentOf([old, morning, sell, evening], sell.id)).toMatchObject({
      before: "4",
      remainingAfter: "4",
      repurchaseBefore: "4",
      repurchaseAfter: "3",
      repurchased: "7",
    });
  });

  it("same instant: a BUY counts as before the SELL, whatever the input order", () => {
    const old = trade("BUY", "X", "10", "1000", { ts: "2024-06-01T09:00:00Z" });
    const sell = trade("SELL", "X", "10", "800", {
      ts: "2025-05-08T12:00:00Z",
    });
    const buy = trade("BUY", "X", "4", "320", { ts: "2025-05-08T12:00:00Z" });

    expect(assessmentOf([old, sell, buy], sell.id)).toMatchObject({
      before: "4",
      repurchaseBefore: "4",
      repurchaseAfter: "0",
    });
  });

  it("does not cross instruments", () => {
    const buy = trade("BUY", "X", "10", "1000", { ts: "2025-01-01" });
    const sell = trade("SELL", "X", "10", "700", { ts: "2025-03-01" });
    const other = trade("BUY", "Y", "10", "700", { ts: "2025-03-15" });

    expect(assessmentOf([buy, sell, other], sell.id).repurchased).toBe("0");
  });

  it("crypto is outside the rule; a rebuy within a year is only pointed out", () => {
    const buy = trade("BUY", "BTC", "1", "60000", { ts: "2025-01-10" });
    const sell = trade("SELL", "BTC", "1", "50000", { ts: "2025-05-08" });
    const rebuy = trade("BUY", "BTC", "1", "52000", { ts: "2025-05-20" });

    const result = assess([buy, sell, rebuy], ["BTC"]);
    expect(result.bySale.has(sell.id)).toBe(false);
    expect(result.notices.get(sell.id)?.buyEventId).toBe(rebuy.id);
  });

  it("crypto: no notice without an acquisition in the following year", () => {
    const buy = trade("BUY", "BTC", "1", "60000", { ts: "2025-01-10" });
    const sell = trade("SELL", "BTC", "1", "50000", {
      ts: "2025-05-08T10:00:00Z",
    });
    const late = trade("BUY", "BTC", "1", "52000", {
      ts: "2026-05-09T10:00:00Z",
    });
    const edge = trade("BUY", "BTC", "1", "52000", {
      ts: "2026-05-08T10:00:00Z",
    });

    const outside = assess([buy, sell, late], ["BTC"]);
    expect(outside.bySale.has(sell.id)).toBe(false);
    expect(outside.notices.has(sell.id)).toBe(false);
    expect(assess([buy, sell, edge], ["BTC"]).notices.has(sell.id)).toBe(true);
  });

  it("crypto: an acquisition only before the sale gives no notice", () => {
    const buy = trade("BUY", "BTC", "2", "120000", { ts: "2025-01-10" });
    const sell = trade("SELL", "BTC", "1", "50000", { ts: "2025-02-08" });

    expect(assess([buy, sell], ["BTC"]).notices.has(sell.id)).toBe(false);
  });
});

function tripsOn(saleTs: string, rebuyTs: string): boolean {
  const lot = trade("BUY", "X", "10", "1000", { ts: "2020-01-01T10:00:00Z" });
  const rebuy = trade("BUY", "X", "5", "350", { ts: rebuyTs });
  const sell = trade("SELL", "X", "10", "700", { ts: saleTs });

  const assessment = assess([lot, rebuy, sell]).bySale.get(sell.id);
  if (!assessment?.repurchased.gt(0)) return false;
  expect(assessment.recipients.map((r) => r.buyEventId)).toEqual([rebuy.id]);
  return true;
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
