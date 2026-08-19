import type { InflationPoint } from "~/core/ports";

import { deriveBaseYear, parseIneSeries } from "./parse";

const BASE = "https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE";

const ALL_POINTS = 1000;

/**
 * INE Tempus3 series codes for the general consumer price index.
 *
 * Found, not guessed: `TABLAS_OPERACION/IPC` lists the tables, `SERIES_TABLA/24077`
 * holds the single national series and `SERIES_TABLA/24081` the 53 provincial
 * ones. National is the default; Bizkaia is the foral province this portfolio
 * actually lives in, so both are kept.
 */
export const INE_SERIES = {
  ES: "IPC290751", // Nacional. Índice general.
  BI: "IPC308320", // Bizkaia. Índice general.
} as const;

export type SeriesId = keyof typeof INE_SERIES;

export const SERIES_IDS = Object.keys(INE_SERIES) as SeriesId[];

export const DEFAULT_SERIES: SeriesId = "ES";

export class IneInflationProvider {
  readonly source = "INE";

  async getSeries(series: SeriesId): Promise<InflationPoint[]> {
    const cod = INE_SERIES[series];
    const url = `${BASE}/${cod}?nult=${ALL_POINTS}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`INE returned ${res.status} for ${series} (${cod})`);
    }

    const points = parseIneSeries(await res.json());
    if (points.length === 0) {
      throw new Error(`INE returned no usable data for ${series} (${cod})`);
    }

    const base = deriveBaseYear(points);
    if (base === null) {
      throw new Error(
        `Cannot determine the base year of ${series} (${cod}): no single complete ` +
          `year averages 100. Refusing to store levels whose base is unknown.`,
      );
    }

    return points.map((p) => ({
      series,
      period: p.period,
      indexValue: p.indexValue,
      base,
      source: this.source,
    }));
  }
}
