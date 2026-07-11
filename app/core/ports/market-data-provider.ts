export interface Quote {
  symbol: string;
  price: string;
  currency: string;
  asOf: Date;
}

export interface MarketDataProvider {
  readonly source: string;
  getQuotes(symbols: readonly string[]): Promise<Quote[]>;
}
