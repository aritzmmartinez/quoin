export interface PriceSnapshot {
  instrumentId: string;
  price: string;
  currency: string;
  asOf: Date;
  source: string;
}

export interface ReplaceHistoryOptions {
  quoteSymbol?: string | null;
  keepAfter?: Date;
}

export interface PriceRepository {
  saveMany(snapshots: readonly PriceSnapshot[]): Promise<number>;
  latest(): Promise<Map<string, PriceSnapshot>>;
  replaceHistory(
    instrumentId: string,
    snapshots: readonly PriceSnapshot[],
    options?: ReplaceHistoryOptions,
  ): Promise<number>;
  historyFor(instrumentId: string, from?: Date): Promise<PriceSnapshot[]>;
}
