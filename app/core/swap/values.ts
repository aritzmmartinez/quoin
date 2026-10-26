import { dayOf } from "../calendar";
import {
  Money,
  isSwapLeg,
  type LedgerEvent,
  type TradeEvent,
} from "../domain";
import { baseOf } from "../fx";
import {
  DEFAULT_TERRITORY,
  swapValuationRuleFor,
  type SwapValuationRule,
  type Territory,
} from "../tax/config";

export interface SwapLegValue {
  gross: Money;
  fees: Money;
}

export interface SwapPairValue {
  sell: SwapLegValue;
  buy: SwapLegValue;
}

/**
 * What the ledger stores about a swap, in euros. The ledger keeps facts, not
 * the tax reading of them:
 * - `deliveredValue` is the market value of everything that left, fee units
 *   included, on the SELL leg's `grossAmount`. A fee charged on the delivered
 *   leg is part of what was delivered (a SELL of `amount + fee` units); no real
 *   export carries one yet, so that reading is an assumption, covered by a
 *   synthetic fixture.
 * - `receivedValue` is the market value of the received `amount` before any
 *   fee (Kraken prices `amountusd` and `feeusd` alike): the BUY leg's
 *   `grossAmount`, which is the value of the units it holds, plus its `fees`.
 * - `receivedFee` is the value of the units Kraken kept from the received
 *   asset, on the BUY leg's `fees`. The BUY's quantity is already `amount −
 *   fee`, so those units never arrived.
 */
export interface SwapSides {
  deliveredValue: Money;
  receivedValue: Money;
  receivedFee: Money;
}

/**
 * The one place a swap's two legs become the figures FIFO, AVCO and the cost
 * line read, so the tax engine and the cost of a position cannot disagree.
 *
 * With a rule in force (Bizkaia, Art. 47.1.i NF 13/2013; Art. 47.1.p, from
 * NF 6/2025, values crypto at market or the agreed price if higher): T is the
 * greater of the delivered value and the gross received value. The value of
 * what is delivered is T, less the fee taken from what is received as an inherent
 * transmission expense (Art. 45.3). The acquisition value of what is received
 * is that same figure, T − F (Art. 45.1.a, real amount), so the fee is counted
 * once: deducting F from the transmission and adding it to the acquisition
 * would reduce one gain by it and raise the next basis by it. Taking the
 * greater avoids taxing the same gain twice when the two market values differ.
 * The norm does not state the greater in so many words; it is Quoin's reasoned
 * criterion.
 *
 * The SELL carries F as `fees` (its proceeds are T − F); the BUY carries T − F
 * as `gross` and no fees, because a BUY's cost is `gross + fees`.
 *
 * With no rule, each leg stays at its own market value, the fee still coming
 * off what was received.
 */
export function swapPairValue(
  sides: SwapSides,
  rule: SwapValuationRule | null,
): SwapPairValue {
  const { deliveredValue, receivedValue, receivedFee } = sides;
  if (rule === null) {
    return {
      sell: { gross: deliveredValue, fees: Money.zero() },
      buy: { gross: receivedValue.subtract(receivedFee), fees: Money.zero() },
    };
  }
  const greater =
    deliveredValue.compare(receivedValue) >= 0 ? deliveredValue : receivedValue;
  return {
    sell: { gross: greater, fees: receivedFee },
    buy: { gross: greater.subtract(receivedFee), fees: Money.zero() },
  };
}

function loneLegValue(trade: TradeEvent): SwapLegValue {
  const gross = baseOf(trade, "grossAmount");
  return trade.type === "SELL"
    ? { gross, fees: baseOf(trade, "fees") }
    : { gross, fees: Money.zero() };
}

export type TradeAmounts = (trade: TradeEvent) => SwapLegValue;

export interface TradeAmountsOptions {
  territory?: Territory;
  rules?: readonly SwapValuationRule[];
}

/**
 * The gross and fees, in euros, that a trade is booked at. A plain trade is its
 * own row. A swap leg is valued through `swapPairValue` together with the leg
 * it is linked to, by the rule in force on the Madrid day of the swap. A leg
 * with no partner in the ledger (one that does not pair as exactly one SELL and
 * one BUY) keeps its own market value, since the import writes both or neither.
 *
 * `events` must already be `bookable`: every amount is read through `baseOf`.
 */
export function tradeAmounts(
  events: readonly LedgerEvent[],
  options: TradeAmountsOptions = {},
): TradeAmounts {
  const territory = options.territory ?? DEFAULT_TERRITORY;
  const groups = new Map<string, TradeEvent[]>();
  for (const event of events) {
    if (
      (event.type === "BUY" || event.type === "SELL") &&
      isSwapLeg(event) &&
      event.linkId != null
    ) {
      const group = groups.get(event.linkId) ?? [];
      group.push(event);
      groups.set(event.linkId, group);
    }
  }

  const values = new Map<string, SwapLegValue>();
  for (const group of groups.values()) {
    const sells = group.filter((leg) => leg.type === "SELL");
    const buys = group.filter((leg) => leg.type === "BUY");
    const sell = sells[0];
    const buy = buys[0];
    if (sells.length === 1 && buys.length === 1 && sell && buy) {
      const pair = swapPairValue(
        {
          deliveredValue: baseOf(sell, "grossAmount"),
          receivedValue: baseOf(buy, "grossAmount").add(baseOf(buy, "fees")),
          receivedFee: baseOf(buy, "fees"),
        },
        swapValuationRuleFor(territory, dayOf(sell.ts), options.rules),
      );
      values.set(sell.id, pair.sell);
      values.set(buy.id, pair.buy);
    } else {
      for (const leg of group) values.set(leg.id, loneLegValue(leg));
    }
  }

  return (trade) =>
    values.get(trade.id) ?? {
      gross: baseOf(trade, "grossAmount"),
      fees: baseOf(trade, "fees"),
    };
}
