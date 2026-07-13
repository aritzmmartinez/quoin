import Decimal from "decimal.js";

import { Money } from "../domain";
import type { Position } from "./positions";
import { tradeMetaKey } from "./trade-meta";

/** Latest price for an instrument (as persisted by the market-data sync). */
export interface PriceLike {
  price: string;
  currency: string;
}

/** Market-derived figures for one position. Null when no usable price exists. */
export interface MarketValue {
  /** quantity × price, in the base currency. */
  marketValue: string | null;
  /** marketValue − costBasis (invested). */
  unrealizedPnL: string | null;
  /** Fraction of the total portfolio market value (0..1). */
  weight: string | null;
}

/**
 * Compute market value, unrealized P&L and weight per position from the latest
 * prices, keyed by `instrumentId::sleeve` (same convention as computePositions).
 *
 * A position is left unpriced (all fields null) when there is no snapshot for its
 * instrument, or when the snapshot is not in the base currency — we don't convert
 * FX here, so a foreign-currency quote is treated as "no usable price" rather than
 * silently mixing currencies. Weight is each priced position's share of the total
 * priced market value, so weights sum to 1 across priced holdings.
 *
 * Pure and deterministic.
 */
export function computeMarketValues(
  positions: readonly Position[],
  prices: ReadonlyMap<string, PriceLike>,
  baseCurrency: string,
): Map<string, MarketValue> {
  const partial = new Map<
    string,
    { marketValue: string | null; unrealizedPnL: string | null }
  >();
  let total = new Decimal(0);

  for (const position of positions) {
    const key = tradeMetaKey(position.instrumentId, position.sleeve);
    const price = prices.get(position.instrumentId);

    if (!price || price.currency !== baseCurrency) {
      partial.set(key, { marketValue: null, unrealizedPnL: null });
      continue;
    }

    const marketValue = Money.fromString(price.price).scaleBy(position.quantity);
    const unrealizedPnL = marketValue.subtract(Money.fromString(position.costBasis));

    partial.set(key, {
      marketValue: marketValue.toString(),
      unrealizedPnL: unrealizedPnL.toString(),
    });
    total = total.plus(new Decimal(marketValue.toString()));
  }

  const result = new Map<string, MarketValue>();
  for (const [key, value] of partial) {
    const weight =
      value.marketValue !== null && total.gt(0)
        ? new Decimal(value.marketValue).div(total).toFixed(6)
        : null;
    result.set(key, { ...value, weight });
  }
  return result;
}
