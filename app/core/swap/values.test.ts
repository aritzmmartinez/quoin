import { describe, expect, it } from "vitest";

import { Money, type LedgerEvent, type TradeEvent } from "../domain";
import {
  SWAP_VALUATION_RULES,
  swapValuationRuleFor,
  type SwapValuationRule,
} from "../tax/config";

import { swapPairValue, tradeAmounts } from "./values";

const eur = Money.fromString;
const RULE = SWAP_VALUATION_RULES[0]!;

function leg(
  type: "BUY" | "SELL",
  instrumentId: string,
  quantity: string,
  grossAmount: string,
  opts: Partial<TradeEvent> = {},
): TradeEvent {
  return {
    id: `${type}-${instrumentId}-${opts.linkId ?? "plain"}`,
    ts: new Date("2026-03-10T10:00:00Z"),
    type,
    instrumentId,
    quantity,
    price: "0",
    grossAmount,
    fees: "0",
    currency: "EUR",
    account: "kraken",
    source: "KRAKEN_CSV",
    ...opts,
  };
}

const swap = (over: Partial<TradeEvent> = {}) =>
  ({ linkId: "refid-1", linkKind: "swap", ...over }) as Partial<TradeEvent>;

describe("swapPairValue", () => {
  it("values both legs at T − F when what was delivered is worth more than what was received", () => {
    const pair = swapPairValue(
      {
        deliveredValue: eur("480"),
        receivedValue: eur("470"),
        receivedFee: eur("5"),
      },
      RULE,
    );
    expect(pair.sell.gross.toString()).toBe("480");
    expect(pair.sell.fees.toString()).toBe("5");
    expect(pair.buy.gross.toString()).toBe("475");
    expect(pair.buy.fees.toString()).toBe("0");
    expect(pair.sell.gross.subtract(pair.sell.fees).toString()).toBe(
      pair.buy.gross.add(pair.buy.fees).toString(),
    );
  });

  it("takes the received side when it is worth more", () => {
    const pair = swapPairValue(
      {
        deliveredValue: eur("460"),
        receivedValue: eur("470"),
        receivedFee: eur("5"),
      },
      RULE,
    );
    expect(pair.sell.gross.toString()).toBe("470");
    expect(pair.buy.gross.toString()).toBe("465");
  });

  it("counts the fee once: it comes off the transmission and is not added to the acquisition", () => {
    const pair = swapPairValue(
      {
        deliveredValue: eur("480"),
        receivedValue: eur("480"),
        receivedFee: eur("5"),
      },
      RULE,
    );
    const proceeds = pair.sell.gross.subtract(pair.sell.fees);
    const cost = pair.buy.gross.add(pair.buy.fees);
    expect(proceeds.toString()).toBe("475");
    expect(cost.toString()).toBe("475");
  });

  it("with a fee charged on the delivered leg, that fee is inside what was delivered", () => {
    const pair = swapPairValue(
      {
        deliveredValue: eur("485"),
        receivedValue: eur("480"),
        receivedFee: Money.zero(),
      },
      RULE,
    );
    expect(pair.sell.gross.toString()).toBe("485");
    expect(pair.sell.fees.toString()).toBe("0");
    expect(pair.buy.gross.toString()).toBe("485");
  });

  it("with no rule in force leaves each leg at its own market value", () => {
    const pair = swapPairValue(
      {
        deliveredValue: eur("480"),
        receivedValue: eur("470"),
        receivedFee: eur("5"),
      },
      null,
    );
    expect(pair.sell.gross.toString()).toBe("480");
    expect(pair.buy.gross.toString()).toBe("465");
  });
});

describe("swapValuationRuleFor", () => {
  const rules: SwapValuationRule[] = [
    { territory: "bizkaia", from: "2025-01-01", to: "2026-12-31", source: "t" },
  ];

  it("is chosen by the Madrid day of the swap, both ends inclusive", () => {
    expect(swapValuationRuleFor("bizkaia", "2024-12-31", rules)).toBeNull();
    expect(swapValuationRuleFor("bizkaia", "2025-01-01", rules)).not.toBeNull();
    expect(swapValuationRuleFor("bizkaia", "2026-12-31", rules)).not.toBeNull();
    expect(swapValuationRuleFor("bizkaia", "2027-01-01", rules)).toBeNull();
  });
});

describe("tradeAmounts", () => {
  const sell = leg("SELL", "ETH", "4", "480", swap());
  const buy = leg("BUY", "BTC", "0.0099", "470", swap({ fees: "5" }));

  it("reads a plain trade as it was booked", () => {
    const plain = leg("BUY", "ETH", "10", "1000", { fees: "2" });
    const amounts = tradeAmounts([plain])(plain);
    expect(amounts.gross.toString()).toBe("1000");
    expect(amounts.fees.toString()).toBe("2");
  });

  it("values the two legs of a swap together", () => {
    const amountsOf = tradeAmounts([sell, buy]);
    expect(amountsOf(sell).gross.toString()).toBe("480");
    expect(amountsOf(sell).fees.toString()).toBe("5");
    expect(amountsOf(buy).gross.toString()).toBe("475");
    expect(amountsOf(buy).fees.toString()).toBe("0");
  });

  it("converts each leg before comparing, at the rate it was booked at", () => {
    const usd = {
      currency: "USD",
      fxSource: "ECB" as const,
      fxRate: "1.25",
      fxDirection: "QUOTE_PER_BASE" as const,
      fxDate: "2026-03-10",
    };
    const sellUsd = leg("SELL", "ETH", "4", "600", swap(usd));
    const buyUsd = leg("BUY", "BTC", "0.0099", "587.5", {
      ...swap(usd),
      fees: "6.25",
    });
    const amountsOf = tradeAmounts([sellUsd, buyUsd]);
    expect(amountsOf(sellUsd).gross.toString()).toBe("480");
    expect(amountsOf(sellUsd).fees.toString()).toBe("5");
    expect(amountsOf(buyUsd).gross.toString()).toBe("475");
  });

  it("keeps a leg with no partner at its own market value", () => {
    const amountsOf = tradeAmounts([sell]);
    expect(amountsOf(sell).gross.toString()).toBe("480");
    const alone = tradeAmounts([buy]);
    expect(alone(buy).gross.toString()).toBe("465");
    expect(alone(buy).fees.toString()).toBe("0");
  });

  it("keeps each leg at its own market value when no rule is in force that day", () => {
    const amountsOf = tradeAmounts([sell, buy], {
      rules: [
        { territory: "bizkaia", from: "2030-01-01", to: null, source: "t" },
      ],
    });
    expect(amountsOf(sell).gross.toString()).toBe("480");
    expect(amountsOf(buy).gross.toString()).toBe("465");
  });

  it("pairs by link, so two swaps in one ledger do not mix", () => {
    const sell2 = leg("SELL", "SOL", "2", "100", swap({ linkId: "refid-2" }));
    const buy2 = leg(
      "BUY",
      "BTC",
      "0.002",
      "90",
      swap({ linkId: "refid-2", fees: "1" }),
    );
    const events: LedgerEvent[] = [sell, buy, sell2, buy2];
    const amountsOf = tradeAmounts(events);
    expect(amountsOf(sell2).gross.toString()).toBe("100");
    expect(amountsOf(buy2).gross.toString()).toBe("99");
    expect(amountsOf(buy).gross.toString()).toBe("475");
  });
});
