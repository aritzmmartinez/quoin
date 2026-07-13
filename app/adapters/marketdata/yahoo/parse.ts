import type { Quote } from "~/core/ports";

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        regularMarketPrice?: number;
        regularMarketTime?: number;
      };
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
