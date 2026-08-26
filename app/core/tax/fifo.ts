import Decimal from "decimal.js";

import {
  Money,
  type LedgerEvent,
  type Revalue,
  type Sleeve,
  type TradeEvent,
} from "../domain";
import { tradeMetaKey } from "../projections/trade-meta";

export interface FifoLot {
  id: string;
  instrumentId: string;
  sleeve: Sleeve;
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

export interface FifoSale {
  trade: TradeEvent;
  quantity: Decimal;
  gross: Money;
  fees: Money;
  costRemoved: Money;
  realizedPnL: Money;
  lots: FifoLotConsumption[];
}

export interface FifoWalk {
  lots: Map<string, FifoLot[]>;
  sales: FifoSale[];
}

function isTrade(event: LedgerEvent): event is TradeEvent {
  return event.type === "BUY" || event.type === "SELL";
}

export function walkFifo(
  events: readonly LedgerEvent[],
  revalue?: Revalue,
): FifoWalk {
  const trades = events
    .filter(isTrade)
    .slice()
    .sort((a, b) => a.ts.getTime() - b.ts.getTime());

  const restate: Revalue = revalue ?? ((money) => money);
  const queues = new Map<string, FifoLot[]>();
  const sales: FifoSale[] = [];

  for (const trade of trades) {
    const key = tradeMetaKey(trade.instrumentId, trade.sleeve);
    let queue = queues.get(key);
    if (!queue) {
      queue = [];
      queues.set(key, queue);
    }

    const quantity = new Decimal(trade.quantity);
    const gross = restate(
      Money.fromString(trade.grossAmount).scaleBy(trade.fxToBase),
      trade.ts,
    );
    const fees = restate(
      Money.fromString(trade.fees).scaleBy(trade.fxToBase),
      trade.ts,
    );

    if (trade.type === "BUY") {
      const unitCost = quantity.isZero()
        ? Money.zero()
        : gross.add(fees).divideBy(quantity);
      queue.push({
        id: trade.id,
        instrumentId: trade.instrumentId,
        sleeve: trade.sleeve,
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
    });
  }

  return { lots: queues, sales };
}
