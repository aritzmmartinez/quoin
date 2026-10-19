export interface Quote {
  symbol: string;
  price: string;
  currency: string;
  asOf: Date;
  name?: string;
}

export type HistoryRange = "1y" | "2y" | "5y" | "10y" | "max";

export interface HistorySpan {
  from: Date;
  to: Date;
}

export const HISTORY_RANGE_DAYS: Record<
  Exclude<HistoryRange, "max">,
  number
> = {
  "1y": 365,
  "2y": 730,
  "5y": 1826,
  "10y": 3652,
};

export class MarketDataUnavailableError extends Error {
  constructor(
    readonly symbol: string,
    readonly status: number | null,
    options?: { cause?: unknown },
  ) {
    super(
      status === null
        ? `Market data unavailable for ${symbol}`
        : `Market data unavailable for ${symbol} (HTTP ${status})`,
      options,
    );
    this.name = "MarketDataUnavailableError";
  }
}

export interface MarketDataProvider {
  readonly source: string;
  getQuote(symbol: string): Promise<Quote | null>;
  getHistory(
    symbol: string,
    range: HistoryRange | HistorySpan,
  ): Promise<Quote[]>;
}
