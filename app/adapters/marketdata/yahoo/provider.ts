import type { HistoryRange, MarketDataProvider, Quote } from "~/core/ports";

import { parseYahooChart, parseYahooChartHistory } from "./parse";

const BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; quoin/price-sync)" };

async function fetchOne(symbol: string): Promise<Quote | null> {
  const url = `${BASE}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;
  return parseYahooChart(await res.json(), symbol);
}

async function fetchHistory(
  symbol: string,
  range: HistoryRange,
): Promise<Quote[]> {
  const url = `${BASE}/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return [];
  return parseYahooChartHistory(await res.json(), symbol);
}

/**
 * Yahoo Finance provider using the unofficial chart endpoint (one request per
 * symbol). Unknown or failing symbols are dropped, never thrown, so one bad
 * ticker can't sink a whole sync.
 */
export class YahooMarketDataProvider implements MarketDataProvider {
  readonly source = "YAHOO";

  async getQuotes(symbols: readonly string[]): Promise<Quote[]> {
    const settled = await Promise.allSettled(symbols.map(fetchOne));
    return settled
      .filter(
        (r): r is PromiseFulfilledResult<Quote> =>
          r.status === "fulfilled" && r.value !== null,
      )
      .map((r) => r.value);
  }

  async getHistory(symbol: string, range: HistoryRange): Promise<Quote[]> {
    try {
      return await fetchHistory(symbol, range);
    } catch {
      return [];
    }
  }
}
