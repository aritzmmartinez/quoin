import Decimal from "decimal.js";

import {
  Money,
  type LedgerEvent,
  type Revalue,
  type Sleeve,
  type TradeEvent,
} from "../domain";

import { tradeMetaKey } from "./trade-meta";

export interface AvcoLot {
  instrumentId: string;
  sleeve: Sleeve;
  quantity: Decimal;
  costBasis: Money;
  realizedPnL: Money;
  acquiredAt: Decimal | null;
}

export interface AvcoSale {
  trade: TradeEvent;
  quantity: Decimal;
  gross: Money;
  fees: Money;
  costRemoved: Money;
  realizedPnL: Money;
  acquiredAt: Decimal | null;
}

export interface AvcoWalk {
  lots: Map<string, AvcoLot>;
  sales: AvcoSale[];
}

function isTrade(event: LedgerEvent): event is TradeEvent {
  return event.type === "BUY" || event.type === "SELL";
}

export function walkAvco(
  events: readonly LedgerEvent[],
  revalue?: Revalue,
): AvcoWalk {
  const trades = events
    .filter(isTrade)
    .slice()
    .sort((a, b) => a.ts.getTime() - b.ts.getTime());

  const restate: Revalue = revalue ?? ((money) => money);
  const lots = new Map<string, AvcoLot>();
  const sales: AvcoSale[] = [];

  for (const trade of trades) {
    const key = tradeMetaKey(trade.instrumentId, trade.sleeve);
    let lot = lots.get(key);
    if (!lot) {
      lot = {
        instrumentId: trade.instrumentId,
        sleeve: trade.sleeve,
        quantity: new Decimal(0),
        costBasis: Money.zero(),
        realizedPnL: Money.zero(),
        acquiredAt: null,
      };
      lots.set(key, lot);
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
      lot.acquiredAt = blendAcquisition(lot, quantity, trade.ts);
      lot.costBasis = lot.costBasis.add(gross).add(fees);
      lot.quantity = lot.quantity.plus(quantity);
      continue;
    }

    const averageCost = lot.quantity.isZero()
      ? Money.zero()
      : lot.costBasis.divideBy(lot.quantity);
    const costRemoved = averageCost.scaleBy(quantity);
    const proceeds = gross.subtract(fees);
    const realizedPnL = proceeds.subtract(costRemoved);

    sales.push({
      trade,
      quantity,
      gross,
      fees,
      costRemoved,
      realizedPnL,
      acquiredAt: lot.acquiredAt,
    });

    lot.realizedPnL = lot.realizedPnL.add(realizedPnL);
    lot.costBasis = lot.costBasis.subtract(costRemoved);
    lot.quantity = lot.quantity.minus(quantity);

    if (lot.quantity.isZero()) {
      lot.costBasis = Money.zero();
      lot.acquiredAt = null;
    }
  }

  return { lots, sales };
}

function blendAcquisition(
  lot: AvcoLot,
  quantity: Decimal,
  ts: Date,
): Decimal | null {
  const bought = new Decimal(ts.getTime());
  if (quantity.isZero()) return lot.acquiredAt;
  if (lot.acquiredAt === null || lot.quantity.lte(0)) return bought;

  return lot.acquiredAt
    .times(lot.quantity)
    .plus(bought.times(quantity))
    .dividedBy(lot.quantity.plus(quantity));
}
