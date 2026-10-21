export interface FxRate {
  base: string;
  quote: string;
  day: string;
  rate: string;
  source: string;
}

export interface FxSeries {
  source: string;
  base: string;
  quote: string;
}

export interface FxSaveResult {
  inserted: number;
  unchanged: number;
  conflicts: { stored: FxRate; incoming: FxRate }[];
}

export interface FxRepository {
  save(series: FxSeries, rates: readonly FxRate[]): Promise<FxSaveResult>;
  list(series: FxSeries): Promise<FxRate[]>;
  firstDay(series: FxSeries): Promise<string | null>;
  lastDay(series: FxSeries): Promise<string | null>;
  lastSyncedAt(series: FxSeries): Promise<Date | null>;
  markChecked(series: FxSeries): Promise<void>;
}

export function fxSeriesKey(series: FxSeries): string {
  return `${series.source}:${series.base}:${series.quote}`;
}
