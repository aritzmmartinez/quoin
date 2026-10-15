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

export interface DailyWriteCount {
  inserted: number;
  corrected: number;
  live: boolean;
}

export interface PriceRepository {
  saveMany(snapshots: readonly PriceSnapshot[]): Promise<number>;
  saveDaily(
    instrumentId: string,
    candles: readonly PriceSnapshot[],
    live: PriceSnapshot | null,
  ): Promise<DailyWriteCount>;
  lastAsOf(instrumentId: string): Promise<Date | null>;
  latest(): Promise<Map<string, PriceSnapshot>>;
  replaceHistory(
    instrumentId: string,
    snapshots: readonly PriceSnapshot[],
    options?: ReplaceHistoryOptions,
  ): Promise<number>;
  historyFor(instrumentId: string, from?: Date): Promise<PriceSnapshot[]>;
}
