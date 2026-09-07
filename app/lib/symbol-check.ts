import Decimal from "decimal.js";

import { isFreshQuote } from "~/adapters/marketdata";
import type { Quote } from "~/core/ports";

export interface SymbolCheck {
  symbol: string;
  price: string;
  currency: string;
  asOf: string;
  fresh: boolean;
  quantity: string;
  impliedValue: string;
  closed: boolean;
}

export function checkSymbol(
  quote: Quote,
  quantity: string,
  now?: Date,
): SymbolCheck {
  const held = new Decimal(quantity);

  return {
    symbol: quote.symbol,
    price: quote.price,
    currency: quote.currency,
    asOf: quote.asOf.toISOString(),
    fresh: isFreshQuote(quote, now),
    quantity: held.toString(),
    impliedValue: new Decimal(quote.price).mul(held).toFixed(2),
    closed: held.isZero(),
  };
}

export function heldQuantity(
  positions: readonly { instrumentId: string; quantity: string }[],
  instrumentId: string,
): string {
  return positions
    .filter((position) => position.instrumentId === instrumentId)
    .reduce((sum, position) => sum.plus(position.quantity), new Decimal(0))
    .toString();
}
