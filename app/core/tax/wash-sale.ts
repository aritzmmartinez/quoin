import {
  addCalendarMonths,
  isWithin,
  toCalendarDate,
  type CalendarDate,
} from "../calendar";
import type { TradeEvent } from "../domain";

import { FISCAL_TIME_ZONE, WASH_SALE_WINDOW_MONTHS } from "./config";
import type { FifoSale } from "./fifo";

export interface WashSaleTrigger {
  buyEventId: string;
  buyTs: Date;
}

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

/**
 * Deliberate simplification of Art. 43 NF 13/2013 (pérdidas patrimoniales no
 * computables — recompra de valores homogéneos): the real rule DEFERS the loss
 * until the repurchased position is definitively transmitted with no further
 * repurchase in window. Quoin
 * does not model that deferral — it only EXCLUDES the loss from the year's
 * deductible net. The exclusion is flagged, never silently dropped, so it
 * stays visible to whoever files the return.
 *
 * The trade(s) that make up the sold lot(s) are excluded from the candidate
 * search: they are the position being closed, not a repurchase of it. Without
 * that exclusion, almost every quick loss sale would trip the rule on its own
 * acquisition simply for having been held less than the window.
 */
export function findWashSaleTrigger(
  sale: FifoSale,
  trades: readonly TradeEvent[],
): WashSaleTrigger | null {
  const consumedBuyIds = new Set(sale.lots.map((lot) => lot.lotId));
  const { start, end } = washSaleWindow(sale.trade.ts);

  const candidates = trades
    .filter(
      (t) =>
        t.type === "BUY" &&
        t.instrumentId === sale.trade.instrumentId &&
        !consumedBuyIds.has(t.id) &&
        isWithin(toCalendarDate(t.ts, FISCAL_TIME_ZONE), start, end),
    )
    .sort((a, b) => a.ts.getTime() - b.ts.getTime());

  const first = candidates[0];
  return first ? { buyEventId: first.id, buyTs: first.ts } : null;
}
