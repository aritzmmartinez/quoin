import Decimal from "decimal.js";

import { isFreshQuote } from "~/adapters/marketdata";
import { dayOf, shiftDay } from "~/core/calendar";
import {
  Amount,
  BASE_CURRENCY,
  type LedgerEvent,
  type TradeEvent,
} from "~/core/domain";
import { baseOf, bookingRate, hasRate, type RateBook } from "~/core/fx";
import type {
  HistoryRange,
  HistorySpan,
  MarketDataProvider,
  Quote,
} from "~/core/ports";
import { DAILY_CANDLE_MS, candleKnownAt } from "~/core/prices";
import { computePositions } from "~/core/projections";
import { atOrBefore } from "~/core/series";

import { rateSeriesOf, type EnsureRates, type RateSeries } from "./fx-sync";

export const TRADE_CHECKS = 3;
export const TRADE_DEVIATION_LIMIT = "0.1";
const LOOKBACK_MS = 7 * 86_400_000;
const REWARD_NOTE = "kraken-reward";
export const DAILY_HISTORY_PROBE: HistoryRange = "1y";
export const RATE_PROBE_DAYS = 30;

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
  rateSeries: RateSeries;
  dailyHistory: boolean;
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
  dailyHistory = true,
  rateSeries: RateSeries = quote.currency === BASE_CURRENCY
    ? "base"
    : "published",
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
    rateSeries,
    dailyHistory,
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
    hasRate(event) &&
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
      price: new Decimal(baseOf(trade, "grossAmount").toString())
        .div(trade.quantity)
        .toDecimalPlaces(6)
        .toString(),
    }));
}

export function tradeSpan(marks: readonly TradeMark[]): HistorySpan | null {
  if (marks.length === 0) return null;
  const times = marks.map((mark) => mark.ts.getTime());
  return {
    from: new Date(Math.min(...times) - LOOKBACK_MS - DAILY_CANDLE_MS),
    to: new Date(Math.max(...times) + 86_400_000),
  };
}

function closeInBase(
  candle: Quote,
  book: RateBook,
  tradedAt: Date,
): string | null {
  if (candle.currency === BASE_CURRENCY) return candle.price;
  const rate = bookingRate(book, candle.currency, dayOf(tradedAt));
  if (rate === null) return null;
  return Amount.of(candle.price, candle.currency)
    .inBase(rate.rate, "QUOTE_PER_BASE")
    .toString();
}

export function compareTrades(
  marks: readonly TradeMark[],
  candles: readonly Quote[],
  book: RateBook = new Map(),
): TradeComparison[] {
  const knownAt = (quote: Quote) => candleKnownAt(quote.asOf);
  const sorted = [...candles].sort((a, b) => knownAt(a) - knownAt(b));
  const limit = new Decimal(TRADE_DEVIATION_LIMIT);

  return marks.flatMap((mark) => {
    const candle = atOrBefore(sorted, knownAt, mark.ts.getTime(), LOOKBACK_MS);
    if (!candle) return [];
    const close = closeInBase(candle, book, mark.ts);
    if (close === null) return [];

    const deviation = new Decimal(close).div(mark.price).minus(1);
    return [
      {
        ts: mark.ts.toISOString(),
        traded: mark.price,
        close: new Decimal(close).toDecimalPlaces(6).toString(),
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
  rates: EnsureRates,
  now?: Date,
): Promise<SymbolCheck | null> {
  const quote = await provider.getQuote(symbol);
  if (!quote) return null;

  const marks = recentTradeMarks(events, instrumentId);
  const span = tradeSpan(marks);
  const ensured = await rates(
    new Map([
      [
        quote.currency,
        span
          ? dayOf(span.from)
          : shiftDay(dayOf(now ?? new Date()), -RATE_PROBE_DAYS),
      ],
    ]),
  );
  const rateSeries = rateSeriesOf(ensured, quote.currency);
  const valued = rateSeries === "base" || rateSeries === "published";
  const candles =
    span && valued ? await provider.getHistory(symbol, span) : [];
  const dailyHistory =
    candles.length > 0 || (await hasDailyHistory(provider, symbol));

  return checkSymbol(
    quote,
    heldQuantity(computePositions([...events]), instrumentId),
    now,
    compareTrades(marks, candles, ensured.book),
    marks.length,
    dailyHistory,
    rateSeries,
  );
}

export async function hasDailyHistory(
  provider: MarketDataProvider,
  symbol: string,
): Promise<boolean> {
  return (await provider.getHistory(symbol, DAILY_HISTORY_PROBE)).length > 0;
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
