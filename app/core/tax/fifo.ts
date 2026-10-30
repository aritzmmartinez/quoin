import Decimal from "decimal.js";

import {
  Money,
  compareTrades,
  type LedgerEvent,
  type Revalue,
  type TradeEvent,
} from "../domain";
import { bookable } from "../fx";
import { tradeAmounts } from "../swap";

import type { Jurisdiction } from "./config";

export interface FifoLot {
  id: string;
  instrumentId: string;
  quantity: Decimal;
  unitCost: Money;
  acquiredAt: Date;
}

export interface FifoLotConsumption {
  lotId: string;
  acquiredAt: Date;
  quantity: Decimal;
  unitCost: Money;
  costRemoved: Money;
}

export interface FifoLotBalance {
  lotId: string;
  acquiredAt: Date;
  quantity: Decimal;
}

export interface FifoSale {
  trade: TradeEvent;
  quantity: Decimal;
  gross: Money;
  fees: Money;
  costRemoved: Money;
  realizedPnL: Money;
  lots: FifoLotConsumption[];
  lotsAfter: FifoLotBalance[];
}

export interface FifoWalk {
  lots: Map<string, FifoLot[]>;
  sales: FifoSale[];
}

function isTrade(event: LedgerEvent): event is TradeEvent {
  return event.type === "BUY" || event.type === "SELL";
}

export function sortTrades(events: readonly LedgerEvent[]): TradeEvent[] {
  return bookable(events).filter(isTrade).sort(compareTrades);
}

export function walkFifo(
  events: readonly LedgerEvent[],
  jurisdiction: Jurisdiction,
  revalue?: Revalue,
): FifoWalk {
  const trades = sortTrades(events);
  const amountsOf = tradeAmounts(trades, jurisdiction);

  const restate: Revalue = revalue ?? ((money) => money);
  const queues = new Map<string, FifoLot[]>();
  const sales: FifoSale[] = [];

  for (const trade of trades) {
    const key = trade.instrumentId;
    let queue = queues.get(key);
    if (!queue) {
      queue = [];
      queues.set(key, queue);
    }

    const quantity = new Decimal(trade.quantity);
    const amounts = amountsOf(trade);
    const gross = restate(amounts.gross, trade.ts);
    const fees = restate(amounts.fees, trade.ts);

    if (trade.type === "BUY") {
      const unitCost = quantity.isZero()
        ? Money.zero()
        : gross.add(fees).divideBy(quantity);
      queue.push({
        id: trade.id,
        instrumentId: trade.instrumentId,
        quantity,
        unitCost,
        acquiredAt: trade.ts,
      });
      continue;
    }

    let remaining = quantity;
    const consumed: FifoLotConsumption[] = [];
    let costRemoved = Money.zero();

    while (remaining.gt(0) && queue.length > 0) {
      const lot = queue[0]!;
      const take = Decimal.min(remaining, lot.quantity);
      const takenCost = lot.unitCost.scaleBy(take);

      consumed.push({
        lotId: lot.id,
        acquiredAt: lot.acquiredAt,
        quantity: take,
        unitCost: lot.unitCost,
        costRemoved: takenCost,
      });
      costRemoved = costRemoved.add(takenCost);

      lot.quantity = lot.quantity.minus(take);
      remaining = remaining.minus(take);
      if (lot.quantity.isZero()) queue.shift();
    }

    const proceeds = gross.subtract(fees);
    const realizedPnL = proceeds.subtract(costRemoved);

    sales.push({
      trade,
      quantity,
      gross,
      fees,
      costRemoved,
      realizedPnL,
      lots: consumed,
      lotsAfter: queue.map((lot) => ({
        lotId: lot.id,
        acquiredAt: lot.acquiredAt,
        quantity: lot.quantity,
      })),
    });
  }

  return { lots: queues, sales };
}
