export interface PriceSyncRepository {
  markChecked(instrumentId: string): Promise<void>;
  lastChecked(): Promise<Map<string, Date>>;
}
