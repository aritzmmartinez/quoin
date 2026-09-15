import Decimal from "decimal.js";

import type { LedgerEvent, Revalue, TradeEvent } from "../domain";

import type { Territory } from "./config";
import { walkFifo, type FifoSale } from "./fifo";
import { findWashSaleTrigger } from "./wash-sale";

const YEAR_IN_MADRID = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
});

export function fiscalYearOf(date: Date): number {
  return Number(YEAR_IN_MADRID.format(date));
}

function isTrade(event: LedgerEvent): event is TradeEvent {
  return event.type === "BUY" || event.type === "SELL";
}

export interface TaxLotConsumptionDetail {
  buyEventId: string;
  acquiredAt: Date;
  quantity: string;
  unitCost: string;
}

export interface RealizedGainDetail {
  eventId: string;
  ts: Date;
  instrumentId: string;
  quantity: string;
  grossAmount: string;
  fees: string;
  costBasis: string;
  realizedPnL: string;
  lots: TaxLotConsumptionDetail[];
  disallowed: boolean;
  disallowedByBuyEventId: string | null;
}

export interface TaxYearResult {
  year: number;
  territory: Territory;
  gains: RealizedGainDetail[];
  allowedNet: string;
}

/**
 * FIFO capital gains/losses for one fiscal year — the foral counterpart to
 * computeRealizedGains, which stays AVCO for the portfolio view. Do not
 * merge them: the same sale has two correct answers depending on which
 * question is being asked.
 */
export function computeTaxLots(
  events: readonly LedgerEvent[],
  year: number,
  revalue?: Revalue,
): TaxYearResult {
  const walk = walkFifo(events, revalue);
  const trades = events.filter(isTrade);

  const gains = walk.sales
    .filter((sale) => fiscalYearOf(sale.trade.ts) === year)
    .map((sale) => toGainDetail(sale, trades));

  let allowedNet = new Decimal(0);
  for (const gain of gains) {
    if (gain.disallowed) continue;
    allowedNet = allowedNet.plus(gain.realizedPnL);
  }

  return {
    year,
    territory: "bizkaia",
    gains,
    allowedNet: allowedNet.toFixed(),
  };
}

function toGainDetail(
  sale: FifoSale,
  trades: readonly TradeEvent[],
): RealizedGainDetail {
  const isLoss = sale.realizedPnL.isNegative();
  const trigger = isLoss ? findWashSaleTrigger(sale, trades) : null;

  return {
    eventId: sale.trade.id,
    ts: sale.trade.ts,
    instrumentId: sale.trade.instrumentId,
    quantity: sale.quantity.toFixed(),
    grossAmount: sale.gross.toString(),
    fees: sale.fees.toString(),
    costBasis: sale.costRemoved.toString(),
    realizedPnL: sale.realizedPnL.toString(),
    lots: sale.lots.map((lot) => ({
      buyEventId: lot.lotId,
      acquiredAt: lot.acquiredAt,
      quantity: lot.quantity.toFixed(),
      unitCost: lot.unitCost.toString(),
    })),
    disallowed: trigger !== null,
    disallowedByBuyEventId: trigger?.buyEventId ?? null,
  };
}
