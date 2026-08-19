export interface InflationPoint {
  series: string;
  period: string;
  indexValue: string;
  base: string;
  source: string;
}

export interface InflationRepository {
  saveMany(points: readonly InflationPoint[]): Promise<number>;
  list(series: string): Promise<InflationPoint[]>;
  lastSyncedAt(series: string): Promise<Date | null>;
  deleteSeries(series: string): Promise<number>;
}
