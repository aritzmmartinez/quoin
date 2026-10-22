import Decimal from "decimal.js";

import { Money } from "../domain";
import type { Position } from "./positions";

export interface PriceLike {
  price: string;
  currency: string;
}

export interface MarketValue {
  marketValue: string | null;
  unrealizedPnL: string | null;
  weight: string | null;
}

/**
 * Compute market value, unrealized P&L and weight per position from the latest
 * prices, keyed by instrument id (same convention as computePositions).
 *
 * A position is left unpriced (all fields null) when there is no snapshot for its
 * instrument. A snapshot in another currency throws: prices are converted by
 * pricesInBase before they get here, and that is where a price with no rate is
 * left unvalued. Weight is each priced position's share of the total priced
 * market value, so weights sum to 1 across priced holdings.
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
    const key = position.instrumentId;
    const price = prices.get(key);

    if (!price) {
      partial.set(key, { marketValue: null, unrealizedPnL: null });
      continue;
    }
    if (price.currency !== baseCurrency) {
      throw new Error(
        `Price of ${key} is in ${price.currency}, not ${baseCurrency}; pass prices through pricesInBase() first`,
      );
    }

    const marketValue = Money.fromString(price.price).scaleBy(
      position.quantity,
    );
    const unrealizedPnL = marketValue.subtract(
      Money.fromString(position.costBasis),
    );

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
