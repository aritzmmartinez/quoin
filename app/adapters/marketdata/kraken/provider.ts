import {
  HISTORY_RANGE_DAYS,
  type HistoryRange,
  type HistorySpan,
  MarketDataUnavailableError,
  type MarketDataProvider,
  type Quote,
} from "~/core/ports";
import {
  readKrakenOhlc,
  readKrakenTrade,
  type KrakenReading,
} from "~/core/prices";

import { withTimeout } from "~/adapters/http";

const BASE = "https://api.kraken.com/0/public";
// Measured 2026-11-21: 50–155 ms for 720 daily candles.
export const KRAKEN_TIMEOUT_MS = 15_000;
// Kraken asks for about one public market-data request a second.
export const KRAKEN_SPACING_MS = 1_000;

// Shared by every instance: a sync and an import running at once still ask
// Kraken one request at a time.
let queue: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function turn(spacingMs: number): Promise<void> {
  const mine = queue.then(async () => {
    const wait = lastRequestAt + spacingMs - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
  });
  queue = mine;
  return mine;
}

export function krakenSince(
  range: HistoryRange | HistorySpan,
  now: Date,
): number {
  const seconds = (date: Date) => Math.ceil(date.getTime() / 1000);
  if (typeof range === "object") return seconds(range.from) - 1;
  if (range === "max") return 0;
  return seconds(now) - HISTORY_RANGE_DAYS[range] * 86_400 - 1;
}

export interface KrakenOptions {
  timeoutMs?: number;
  spacingMs?: number;
}

export class KrakenMarketDataProvider implements MarketDataProvider {
  private readonly timeoutMs: number;
  private readonly spacingMs: number;

  constructor(options: KrakenOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? KRAKEN_TIMEOUT_MS;
    this.spacingMs = options.spacingMs ?? KRAKEN_SPACING_MS;
  }

  sourceOf(): string {
    return "KRAKEN";
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const url = `${BASE}/Trades?pair=${encodeURIComponent(symbol)}&count=1`;
    return this.ask(symbol, url, readKrakenTrade);
  }

  async getHistory(
    symbol: string,
    range: HistoryRange | HistorySpan,
  ): Promise<Quote[]> {
    const since = krakenSince(range, new Date());
    const url = `${BASE}/OHLC?pair=${encodeURIComponent(symbol)}&interval=1440&since=${since}`;
    const quotes = await this.ask(symbol, url, readKrakenOhlc);
    return typeof range === "object"
      ? quotes.filter((q) => q.asOf.getTime() <= range.to.getTime())
      : quotes;
  }

  private async ask<T>(
    symbol: string,
    url: string,
    read: (json: unknown, symbol: string) => KrakenReading<T>,
  ): Promise<T> {
    await turn(this.spacingMs);
    let status: number | null = null;
    try {
      const json = await withTimeout(this.timeoutMs, async (signal) => {
        const res = await fetch(url, { signal });
        status = res.status;
        if (!res.ok) throw new MarketDataUnavailableError(symbol, res.status);
        return res.json() as Promise<unknown>;
      });
      const reading = read(json, symbol);
      if (reading.ok) return reading.value;
      throw new MarketDataUnavailableError(symbol, status, {
        cause: new Error(reading.error),
      });
    } catch (cause) {
      if (cause instanceof MarketDataUnavailableError) throw cause;
      throw new MarketDataUnavailableError(symbol, status, { cause });
    }
  }
}
