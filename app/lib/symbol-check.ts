import Decimal from "decimal.js";

import { isFreshQuote } from "~/adapters/marketdata";
import {
  BASE_CURRENCY,
  foreignCurrency,
  type LedgerEvent,
  type TradeEvent,
} from "~/core/domain";
import type { HistorySpan, MarketDataProvider, Quote } from "~/core/ports";
import { computePositions } from "~/core/projections";

export const TRADE_CHECKS = 3;
export const TRADE_DEVIATION_LIMIT = "0.1";
const LOOKBACK_MS = 7 * 86_400_000;
const REWARD_NOTE = "kraken-reward";

export interface TradeMark {
  ts: Date;
  price: string;
}

export interface TradeComparison {
  ts: string;
  traded: string;
  close: string;
  deviation: string;
  off: boolean;
}

export interface SymbolCheck {
  symbol: string;
  name: string | null;
  price: string;
  currency: string;
  asOf: string;
  fresh: boolean;
  quantity: string;
  impliedValue: string;
  closed: boolean;
  foreignCurrency: string | null;
  trades: TradeComparison[];
  tradesAsked: number;
  tradesOff: boolean;
}

export function checkSymbol(
  quote: Quote,
  quantity: string,
  now?: Date,
  trades: TradeComparison[] = [],
  tradesAsked = trades.length,
): SymbolCheck {
  const held = new Decimal(quantity);

  return {
    symbol: quote.symbol,
    name: quote.name ?? null,
    price: quote.price,
    currency: quote.currency,
    asOf: quote.asOf.toISOString(),
    fresh: isFreshQuote(quote, now),
    quantity: held.toString(),
    impliedValue: new Decimal(quote.price).mul(held).toFixed(2),
    closed: held.isZero(),
    foreignCurrency: foreignCurrency([quote]),
    trades,
    tradesAsked,
    tradesOff: tradesDisagree(trades),
  };
}

function isComparableTrade(
  event: LedgerEvent,
  instrumentId: string,
): event is TradeEvent {
  return (
    (event.type === "BUY" || event.type === "SELL") &&
    event.instrumentId === instrumentId &&
    event.note !== REWARD_NOTE &&
    event.currency === BASE_CURRENCY &&
    new Decimal(event.quantity).gt(0)
  );
}

export function recentTradeMarks(
  events: readonly LedgerEvent[],
  instrumentId: string,
  count = TRADE_CHECKS,
): TradeMark[] {
  return events
    .filter((event) => isComparableTrade(event, instrumentId))
    .sort((a, b) => b.ts.getTime() - a.ts.getTime())
    .slice(0, count)
    .map((trade) => ({
      ts: trade.ts,
      price: new Decimal(trade.grossAmount)
        .div(trade.quantity)
        .toDecimalPlaces(6)
        .toString(),
    }));
}

export function tradeSpan(marks: readonly TradeMark[]): HistorySpan | null {
  if (marks.length === 0) return null;
  const times = marks.map((mark) => mark.ts.getTime());
  return {
    from: new Date(Math.min(...times) - LOOKBACK_MS),
    to: new Date(Math.max(...times) + 86_400_000),
  };
}

export function compareTrades(
  marks: readonly TradeMark[],
  candles: readonly Quote[],
): TradeComparison[] {
  const sorted = [...candles].sort(
    (a, b) => a.asOf.getTime() - b.asOf.getTime(),
  );
  const limit = new Decimal(TRADE_DEVIATION_LIMIT);

  return marks.flatMap((mark) => {
    const at = mark.ts.getTime();
    const candle = sorted.filter((c) => c.asOf.getTime() <= at).at(-1);
    if (!candle || at - candle.asOf.getTime() > LOOKBACK_MS) return [];

    const deviation = new Decimal(candle.price).div(mark.price).minus(1);
    return [
      {
        ts: mark.ts.toISOString(),
        traded: mark.price,
        close: candle.price,
        deviation: deviation.toDecimalPlaces(6).toString(),
        off: deviation.abs().gt(limit),
      },
    ];
  });
}

export function tradesDisagree(
  comparisons: readonly TradeComparison[],
): boolean {
  if (comparisons.length === 0) return false;
  const sizes = comparisons
    .map((c) => new Decimal(c.deviation).abs())
    .sort((a, b) => a.comparedTo(b));
  const mid = Math.floor(sizes.length / 2);
  const median =
    sizes.length % 2 === 0
      ? sizes[mid - 1]!.plus(sizes[mid]!).div(2)
      : sizes[mid]!;
  return median.gt(TRADE_DEVIATION_LIMIT);
}

export async function checkQuoteAgainstLedger(
  provider: MarketDataProvider,
  events: readonly LedgerEvent[],
  instrumentId: string,
  symbol: string,
  now?: Date,
): Promise<SymbolCheck | null> {
  const [quote] = await provider.getQuotes([symbol]);
  if (!quote) return null;

  const marks = recentTradeMarks(events, instrumentId);
  const span = tradeSpan(marks);
  const candles =
    span && !foreignCurrency([quote])
      ? await provider.getHistory(symbol, span)
      : [];

  return checkSymbol(
    quote,
    heldQuantity(computePositions([...events]), instrumentId),
    now,
    compareTrades(marks, candles),
    marks.length,
  );
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
