import {
  HISTORY_RANGE_DAYS,
  type HistoryRange,
  type HistorySpan,
  MarketDataUnavailableError,
  type MarketDataProvider,
  type Quote,
} from "~/core/ports";

import { withTimeout } from "~/adapters/http";

import { parseYahooChart, parseYahooChartHistory } from "./parse";

const BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; quoin/price-sync)" };
export const YAHOO_TIMEOUT_MS = 15_000;

async function fetchChart(
  symbol: string,
  url: string,
  timeoutMs: number,
): Promise<unknown> {
  try {
    return await withTimeout(timeoutMs, async (signal) => {
      const res = await fetch(url, { headers: HEADERS, signal });
      if (res.status === 404) return null;
      if (!res.ok) throw new MarketDataUnavailableError(symbol, res.status);
      try {
        return await res.json();
      } catch (cause) {
        throw new MarketDataUnavailableError(symbol, res.status, { cause });
      }
    });
  } catch (cause) {
    if (cause instanceof MarketDataUnavailableError) throw cause;
    throw new MarketDataUnavailableError(symbol, null, { cause });
  }
}

export interface YahooOptions {
  timeoutMs?: number;
}

export function historyUrl(
  symbol: string,
  range: HistoryRange | HistorySpan,
  now: Date,
): string {
  const seconds = (date: Date) => Math.floor(date.getTime() / 1000);
  const period2 = typeof range === "object" ? seconds(range.to) : seconds(now);
  const period1 =
    typeof range === "object"
      ? seconds(range.from)
      : range === "max"
        ? 0
        : period2 - HISTORY_RANGE_DAYS[range] * 86_400;
  return `${BASE}/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`;
}

export class YahooMarketDataProvider implements MarketDataProvider {
  readonly source = "YAHOO";

  private readonly timeoutMs: number;

  constructor(options: YahooOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? YAHOO_TIMEOUT_MS;
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const url = `${BASE}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const json = await fetchChart(symbol, url, this.timeoutMs);
    return json === null ? null : parseYahooChart(json, symbol);
  }

  async getHistory(
    symbol: string,
    range: HistoryRange | HistorySpan,
  ): Promise<Quote[]> {
    const json = await fetchChart(
      symbol,
      historyUrl(symbol, range, new Date()),
      this.timeoutMs,
    );
    return json === null ? [] : parseYahooChartHistory(json, symbol);
  }
}
