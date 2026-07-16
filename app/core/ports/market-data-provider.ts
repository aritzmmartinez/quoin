export interface Quote {
  symbol: string;
  price: string;
  currency: string;
  asOf: Date;
}

export type HistoryRange = "1y" | "2y" | "5y" | "10y" | "max";

export interface MarketDataProvider {
  readonly source: string;
  getQuotes(symbols: readonly string[]): Promise<Quote[]>;
  getHistory(symbol: string, range: HistoryRange): Promise<Quote[]>;
}
