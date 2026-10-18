import {
  HISTORY_RANGE_DAYS,
  type HistoryRange,
  type HistorySpan,
  MarketDataUnavailableError,
  type MarketDataProvider,
  type Quote,
} from "~/core/ports";

import { parseYahooChart, parseYahooChartHistory } from "./parse";

const BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; quoin/price-sync)" };

async function fetchChart(symbol: string, url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers: HEADERS });
  } catch (cause) {
    throw new MarketDataUnavailableError(symbol, null, { cause });
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new MarketDataUnavailableError(symbol, res.status);
  try {
    return await res.json();
  } catch (cause) {
    throw new MarketDataUnavailableError(symbol, res.status, { cause });
  }
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

  async getQuote(symbol: string): Promise<Quote | null> {
    const url = `${BASE}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const json = await fetchChart(symbol, url);
    return json === null ? null : parseYahooChart(json, symbol);
  }

  async getHistory(
    symbol: string,
    range: HistoryRange | HistorySpan,
  ): Promise<Quote[]> {
    const json = await fetchChart(
      symbol,
      historyUrl(symbol, range, new Date()),
    );
    return json === null ? [] : parseYahooChartHistory(json, symbol);
  }
}
