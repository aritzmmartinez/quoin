export interface Quote {
  symbol: string;
  price: string;
  currency: string;
  asOf: Date;
}

export type HistoryRange = "1y" | "2y" | "5y" | "10y" | "max";

export const HISTORY_RANGE_DAYS: Record<Exclude<HistoryRange, "max">, number> =
  {
    "1y": 365,
    "2y": 730,
    "5y": 1826,
    "10y": 3652,
  };

export interface MarketDataProvider {
  readonly source: string;
  getQuotes(symbols: readonly string[]): Promise<Quote[]>;
  getHistory(symbol: string, range: HistoryRange): Promise<Quote[]>;
}
