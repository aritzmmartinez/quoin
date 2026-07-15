import type { Quote } from "~/core/ports";

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        regularMarketPrice?: number;
        regularMarketTime?: number;
      };
      timestamp?: number[] | null;
      indicators?: {
        quote?: Array<{ close?: Array<number | null> | null }> | null;
      } | null;
    }> | null;
    error?: unknown;
  };
}

/**
 * Extract a {@link Quote} from a Yahoo chart payload, or null if it lacks the
 * price/currency/time we need (unknown symbol, empty result, provider error).
 *
 * Yahoo returns the price as a JSON number; we pin it to a fixed-point string at
 * the boundary so no float ever enters the domain. Pure and fully testable.
 */
export function parseYahooChart(json: unknown, symbol: string): Quote | null {
  const meta = (json as YahooChartResponse)?.chart?.result?.[0]?.meta;
  if (!meta) return null;

  const { regularMarketPrice, currency, regularMarketTime } = meta;
  if (
    typeof regularMarketPrice !== "number" ||
    !Number.isFinite(regularMarketPrice) ||
    typeof currency !== "string" ||
    typeof regularMarketTime !== "number"
  ) {
    return null;
  }

  return {
    symbol,
    price: regularMarketPrice.toFixed(6),
    currency,
    asOf: new Date(regularMarketTime * 1000),
  };
}

export function parseYahooChartHistory(json: unknown, symbol: string): Quote[] {
  const result = (json as YahooChartResponse)?.chart?.result?.[0];
  const currency = result?.meta?.currency;
  const timestamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;

  if (typeof currency !== "string" || !timestamps || !closes) return [];

  const length = Math.min(timestamps.length, closes.length);
  const quotes: Quote[] = [];

  for (let i = 0; i < length; i += 1) {
    const close = closes[i];
    const timestamp = timestamps[i];
    if (
      typeof close !== "number" ||
      !Number.isFinite(close) ||
      typeof timestamp !== "number" ||
      !Number.isFinite(timestamp)
    ) {
      continue;
    }
    quotes.push({
      symbol,
      price: close.toFixed(6),
      currency,
      asOf: new Date(timestamp * 1000),
    });
  }

  return quotes.sort((a, b) => a.asOf.getTime() - b.asOf.getTime());
}
