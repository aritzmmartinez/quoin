import Decimal from "decimal.js";

import type { LedgerEvent, Sleeve } from "../domain";

import { walkAvco } from "./avco";

const MS_PER_DAY = 86_400_000;

export interface RealizedSale {
  eventId: string;
  ts: Date;
  instrumentId: string;
  sleeve: Sleeve;
  quantity: string;
  price: string | null;
  grossAmount: string;
  fees: string;
  costBasis: string;
  realizedPnL: string;
  returnPct: string | null;
  holdingDays: number | null;
}

export function computeRealizedGains(
  events: readonly LedgerEvent[],
): RealizedSale[] {
  return walkAvco(events).sales.map((sale) => {
    const { trade } = sale;
    const costBasis = sale.costRemoved;

    return {
      eventId: trade.id,
      ts: trade.ts,
      instrumentId: trade.instrumentId,
      sleeve: trade.sleeve,
      quantity: sale.quantity.toFixed(),
      price: sale.quantity.isZero()
        ? null
        : sale.gross.divideBy(sale.quantity).toString(),
      grossAmount: sale.gross.toString(),
      fees: sale.fees.toString(),
      costBasis: costBasis.toString(),
      realizedPnL: sale.realizedPnL.toString(),
      returnPct: costBasis.isZero()
        ? null
        : new Decimal(sale.realizedPnL.toString())
            .div(new Decimal(costBasis.toString()))
            .toFixed(6),
      holdingDays:
        sale.acquiredAt === null
          ? null
          : new Decimal(trade.ts.getTime())
              .minus(sale.acquiredAt)
              .div(MS_PER_DAY)
              .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
              .toNumber(),
    };
  });
}
