import Decimal from "decimal.js";

import type { Quote } from "~/core/ports";

export const CLOSE_SIGNIFICANT_DIGITS = 7;

const MINOR_UNITS: Readonly<Record<string, string>> = {
  GBp: "GBP",
  ZAc: "ZAR",
  ILA: "ILS",
};

export function inMajorUnit(
  price: string,
  currency: string,
): { price: string; currency: string } {
  const major = MINOR_UNITS[currency];
  if (major === undefined) return { price, currency };
  return { price: new Decimal(price).div(100).toFixed(), currency: major };
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        longName?: string;
        shortName?: string;
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
 * Yahoo returns the price as a JSON number; we pin it to a decimal string at the
 * boundary so no float ever enters the domain. Pure and fully testable.
 *
 * Measured 2026-10-22: `regularMarketPrice` arrives as the shortest decimal
 * (`763.96`, `4.38E-6`) and is kept exactly; a daily close arrives as a float32
 * widened to a double (`769.0499877929688`), so it is kept to the seven
 * significant digits a float32 holds. Fixed decimal places are wrong both
 * ways: they keep the float32 noise of a large price and erase a price below
 * a millionth.
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

  const name = [meta.longName, meta.shortName]
    .find((n) => typeof n === "string" && n.trim() !== "")
    ?.trim();

  return {
    symbol,
    ...inMajorUnit(new Decimal(String(regularMarketPrice)).toFixed(), currency),
    asOf: new Date(regularMarketTime * 1000),
    ...(name ? { name } : {}),
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
      ...inMajorUnit(
        new Decimal(String(close))
          .toSignificantDigits(CLOSE_SIGNIFICANT_DIGITS)
          .toFixed(),
        currency,
      ),
      asOf: new Date(timestamp * 1000),
    });
  }

  return quotes.sort((a, b) => a.asOf.getTime() - b.asOf.getTime());
}
