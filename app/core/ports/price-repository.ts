export interface PriceSnapshot {
  instrumentId: string;
  price: string;
  currency: string;
  asOf: Date;
  source: string;
}

export interface PriceRepository {
  saveMany(snapshots: readonly PriceSnapshot[]): Promise<number>;
  latest(): Promise<Map<string, PriceSnapshot>>;
  deleteForInstrument(instrumentId: string): Promise<number>;
  historyFor(instrumentId: string): Promise<PriceSnapshot[]>;
}
