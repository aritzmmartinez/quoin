import type {
  HistoryRange,
  HistorySpan,
  MarketDataProvider,
  Quote,
} from "~/core/ports";
import { quoteSourceOf } from "~/core/prices";

import { KrakenMarketDataProvider } from "./kraken/provider";
import { YahooMarketDataProvider } from "./yahoo/provider";

export class MarketDataRouter implements MarketDataProvider {
  constructor(
    private readonly yahoo: MarketDataProvider = new YahooMarketDataProvider(),
    private readonly kraken: MarketDataProvider = new KrakenMarketDataProvider(),
  ) {}

  private providerFor(symbol: string): MarketDataProvider {
    const source = quoteSourceOf(symbol);
    switch (source) {
      case "YAHOO":
        return this.yahoo;
      case "KRAKEN":
        return this.kraken;
    }
  }

  sourceOf(symbol: string): string {
    return this.providerFor(symbol).sourceOf(symbol);
  }

  getQuote(symbol: string): Promise<Quote | null> {
    return this.providerFor(symbol).getQuote(symbol);
  }

  getHistory(
    symbol: string,
    range: HistoryRange | HistorySpan,
  ): Promise<Quote[]> {
    return this.providerFor(symbol).getHistory(symbol, range);
  }
}
