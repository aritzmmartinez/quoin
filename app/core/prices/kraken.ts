import Decimal from "decimal.js";

import type { Quote } from "../ports";

export type QuoteSource = "YAHOO" | "KRAKEN";

/**
 * The one place that decides who prices a symbol. Yahoo never writes a «/» in
 * a symbol, so one that has it is a Kraken pair, BASE/QUOTE.
 */
export function quoteSourceOf(symbol: string): QuoteSource {
  return symbol.includes("/") ? "KRAKEN" : "YAHOO";
}

/**
 * Kraken has no euro pair for these; the dollar line is valued at the ECB
 * rate. Measured 2026-11-21 against AssetPairs.
 */
const QUOTE_CURRENCY: Readonly<Record<string, string>> = { USDG: "USD" };

export function krakenSymbolFor(code: string): string {
  return `${code}/${QUOTE_CURRENCY[code] ?? "EUR"}`;
}

export type KrakenReading<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

// Kraken answers an unknown pair with a 200 and one of these; measured
// 2026-11-21 (BTC/EUR-style names it does not list give the second).
const UNKNOWN_PAIR = new Set([
  "EQuery:Unknown asset pair",
  "EQuery:Invalid asset pair",
]);

const DECIMAL = /^\d+(\.\d+)?$/;

interface KrakenBody {
  error?: unknown;
  result?: Record<string, unknown>;
}

function rowsOf(
  json: unknown,
): KrakenReading<{ rows: unknown[]; last: unknown } | null> {
  const body = json as KrakenBody | null;
  const errors = Array.isArray(body?.error) ? body.error.map(String) : null;
  if (errors === null) return { ok: false, error: "no error field" };
  if (errors.length > 0) {
    return errors.every((e) => UNKNOWN_PAIR.has(e))
      ? { ok: true, value: null }
      : { ok: false, error: errors.join("; ") };
  }
  const result = body?.result;
  // The key is the name asked for or Kraken's own (XXBTZEUR for BTCEUR).
  const keys = result ? Object.keys(result).filter((k) => k !== "last") : [];
  const rows = keys.length === 1 ? result![keys[0]!] : undefined;
  if (!Array.isArray(rows)) return { ok: false, error: "no single pair" };
  return { ok: true, value: { rows, last: result!.last } };
}

function quoteOf(symbol: string, price: string, seconds: number): Quote {
  return {
    symbol,
    price: new Decimal(price).toFixed(),
    currency: symbol.slice(symbol.indexOf("/") + 1),
    asOf: new Date(seconds * 1000),
  };
}

/**
 * Daily candles from `OHLC?interval=1440`. Each is dated 00:00 UTC of its day
 * and carries the close of 24:00, like Yahoo's (measured 2026-11-21 against
 * the hourly candles), so `candleKnownAt` applies unchanged. The newest one is
 * the day still trading: `last` is the time of the newest closed candle, and
 * anything after it is dropped.
 */
export function readKrakenOhlc(
  json: unknown,
  symbol: string,
): KrakenReading<Quote[]> {
  const read = rowsOf(json);
  if (!read.ok) return read;
  if (read.value === null) return { ok: true, value: [] };
  const { rows, last } = read.value;
  if (typeof last !== "number") return { ok: false, error: "no last" };

  const quotes: Quote[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const [time, , , , close] = row as unknown[];
    if (typeof time !== "number" || time > last) continue;
    if (typeof close !== "string" || !DECIMAL.test(close)) continue;
    quotes.push(quoteOf(symbol, close, time));
  }
  return {
    ok: true,
    value: quotes.sort((a, b) => a.asOf.getTime() - b.asOf.getTime()),
  };
}

/**
 * The last trade from `Trades?count=1`, as the live quote. Ticker carries no
 * time, and a live quote is dated by the market, never by the clock.
 */
export function readKrakenTrade(
  json: unknown,
  symbol: string,
): KrakenReading<Quote | null> {
  const read = rowsOf(json);
  if (!read.ok) return read;
  const trade = read.value?.rows.at(-1);
  if (!Array.isArray(trade)) return { ok: true, value: null };
  const [price, , time] = trade as unknown[];
  if (typeof price !== "string" || !DECIMAL.test(price)) {
    return { ok: false, error: "no price" };
  }
  if (typeof time !== "number") return { ok: false, error: "no time" };
  return { ok: true, value: quoteOf(symbol, price, Math.floor(time)) };
}
