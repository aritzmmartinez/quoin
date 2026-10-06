import Decimal from "decimal.js";

import {
  addCalendarMonths,
  isWithin,
  toCalendarDate,
  type CalendarDate,
} from "../calendar";
import type { TradeEvent } from "../domain";

import {
  FISCAL_TIME_ZONE,
  UNLISTED_NOTICE_WINDOW_MONTHS,
  WASH_SALE_WINDOW_MONTHS,
} from "./config";
import { compareTrades, type FifoSale } from "./fifo";

export interface WashSaleWindow {
  start: CalendarDate;
  end: CalendarDate;
}

export function washSaleWindow(saleTs: Date): WashSaleWindow {
  const sale = toCalendarDate(saleTs, FISCAL_TIME_ZONE);
  return {
    start: addCalendarMonths(sale, -WASH_SALE_WINDOW_MONTHS),
    end: addCalendarMonths(sale, WASH_SALE_WINDOW_MONTHS),
  };
}

export interface WashSaleRecipient {
  buyEventId: string;
  acquiredAt: Date;
  quantity: Decimal;
}

export interface WashSaleAssessment {
  saleEventId: string;
  window: WashSaleWindow;
  before: Decimal;
  remainingAfter: Decimal;
  repurchaseBefore: Decimal;
  repurchaseAfter: Decimal;
  repurchased: Decimal;
  fraction: Decimal;
  recipients: WashSaleRecipient[];
}

export interface UnlistedRepurchaseNotice {
  saleEventId: string;
  buyEventId: string;
  buyTs: Date;
}

export interface WashSaleAssessor {
  isListed(instrumentId: string): boolean;
  assess(sale: FifoSale): WashSaleAssessment;
  unlistedNotice(sale: FifoSale): UnlistedRepurchaseNotice | null;
}

export function createWashSaleAssessor(
  trades: readonly TradeEvent[],
  unlistedInstrumentIds: ReadonlySet<string>,
): WashSaleAssessor {
  const ordered = [...trades].sort(compareTrades);
  const position = new Map(ordered.map((t, i) => [t.id, i]));
  const buysByInstrument = new Map<string, TradeEvent[]>();
  for (const t of ordered) {
    if (t.type !== "BUY") continue;
    const list = buysByInstrument.get(t.instrumentId) ?? [];
    list.push(t);
    buysByInstrument.set(t.instrumentId, list);
  }

  const used = new Map<string, Decimal>();
  const free = (buy: TradeEvent): Decimal =>
    Decimal.max(
      new Decimal(buy.quantity).minus(used.get(buy.id) ?? 0),
      new Decimal(0),
    );
  const claim = (buyId: string, quantity: Decimal): void => {
    used.set(buyId, (used.get(buyId) ?? new Decimal(0)).plus(quantity));
  };

  function assess(sale: FifoSale): WashSaleAssessment {
    const saleAt = position.get(sale.trade.id) ?? -1;
    const buys = buysByInstrument.get(sale.trade.instrumentId) ?? [];
    const window = washSaleWindow(sale.trade.ts);
    const inWindow = buys.filter((b) =>
      isWithin(
        toCalendarDate(b.ts, FISCAL_TIME_ZONE),
        window.start,
        window.end,
      ),
    );
    const earlier = inWindow.filter((b) => (position.get(b.id) ?? 0) < saleAt);
    const later = inWindow.filter((b) => (position.get(b.id) ?? 0) > saleAt);

    const before = sum(earlier.map(free));
    const remainingAfter = sum(sale.lotsAfter.map((lot) => lot.quantity));

    const earlierById = new Map(earlier.map((b) => [b.id, b]));
    const held = sale.lotsAfter.flatMap((lot) => {
      const buy = earlierById.get(lot.lotId);
      if (!buy) return [];
      const quantity = Decimal.min(lot.quantity, free(buy));
      return quantity.gt(0)
        ? [{ buyEventId: buy.id, acquiredAt: buy.ts, quantity }]
        : [];
    });

    const repurchaseBefore = Decimal.min(
      before,
      remainingAfter,
      sum(held.map((h) => h.quantity)),
    );
    const repurchaseAfter = sum(later.map(free));
    const repurchased = Decimal.min(
      repurchaseBefore.plus(repurchaseAfter),
      sale.quantity,
    );

    const recipients: WashSaleRecipient[] = [];
    let open = Decimal.min(repurchaseBefore, repurchased);
    for (const h of held) {
      if (open.lte(0)) break;
      const take = Decimal.min(open, h.quantity);
      recipients.push({ ...h, quantity: take });
      open = open.minus(take);
    }
    open = repurchased.minus(sum(recipients.map((r) => r.quantity)));
    for (const buy of later) {
      if (open.lte(0)) break;
      const take = Decimal.min(open, free(buy));
      if (take.lte(0)) continue;
      recipients.push({
        buyEventId: buy.id,
        acquiredAt: buy.ts,
        quantity: take,
      });
      open = open.minus(take);
    }
    for (const r of recipients) claim(r.buyEventId, r.quantity);

    return {
      saleEventId: sale.trade.id,
      window,
      before,
      remainingAfter,
      repurchaseBefore,
      repurchaseAfter,
      repurchased,
      fraction: sale.quantity.gt(0)
        ? repurchased.dividedBy(sale.quantity)
        : new Decimal(0),
      recipients,
    };
  }

  return {
    isListed: (instrumentId) => !unlistedInstrumentIds.has(instrumentId),
    assess,
    unlistedNotice: (sale) =>
      findUnlistedRepurchase(
        sale,
        buysByInstrument.get(sale.trade.instrumentId) ?? [],
        position,
        position.get(sale.trade.id) ?? -1,
      ),
  };
}

function findUnlistedRepurchase(
  sale: FifoSale,
  buys: readonly TradeEvent[],
  position: ReadonlyMap<string, number>,
  saleAt: number,
): UnlistedRepurchaseNotice | null {
  const start = toCalendarDate(sale.trade.ts, FISCAL_TIME_ZONE);
  const end = addCalendarMonths(start, UNLISTED_NOTICE_WINDOW_MONTHS);
  const buy = buys.find(
    (b) =>
      (position.get(b.id) ?? 0) > saleAt &&
      isWithin(toCalendarDate(b.ts, FISCAL_TIME_ZONE), start, end),
  );
  return buy
    ? { saleEventId: sale.trade.id, buyEventId: buy.id, buyTs: buy.ts }
    : null;
}

function sum(values: readonly Decimal[]): Decimal {
  return values.reduce((acc, v) => acc.plus(v), new Decimal(0));
}
