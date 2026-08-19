/**
 * Pure parsing of INE's Tempus3 `DATOS_SERIE` payload. No I/O, fully testable.
 *
 * Shape confirmed against the live endpoint, e.g.
 *   https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/IPC290751?nult=4
 *
 * {"COD":"IPC290751", "Nombre":"Nacional. Índice general. Índice. ",
 *  "Data":[{"Fecha":1774994400000,"FK_TipoDato":1,"FK_Periodo":4,
 *           "Anyo":2026,"Valor":102.883,"Secreto":false}, ...]}
 */

interface IneDatum {
  Fecha?: number;
  FK_Periodo?: number;
  Anyo?: number;
  Valor?: number | null;
  Secreto?: boolean;
}

interface IneSeriesResponse {
  COD?: string;
  Data?: IneDatum[] | null;
}

export interface InePoint {
  period: string;
  indexValue: string;
}

/**
 * The month comes from `Anyo` + `FK_Periodo`, NEVER from `Fecha`.
 *
 * `Fecha` is epoch milliseconds anchored to Europe/Madrid, so April 2026 arrives
 * as 1774994400000 — 2026-03-31T22:00Z. Read as UTC it is March, and it is March
 * for every month whose first day falls in summer time, one hour off in winter,
 * two in summer. The month is already in the payload as an integer; deriving it
 * from a timestamp is inventing a timezone question that does not need asking.
 */
export function parseIneSeries(json: unknown): InePoint[] {
  const data = (json as IneSeriesResponse)?.Data;
  if (!Array.isArray(data)) return [];

  const points: InePoint[] = [];
  for (const datum of data) {
    const { Anyo: year, FK_Periodo: month, Valor: value, Secreto } = datum;

    if (Secreto === true) continue;
    if (typeof year !== "number" || !Number.isInteger(year)) continue;
    if (typeof month !== "number" || month < 1 || month > 12) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;

    points.push({
      period: `${year}-${String(month).padStart(2, "0")}`,
      indexValue: value.toFixed(3),
    });
  }

  return points.sort((a, b) => a.period.localeCompare(b.period));
}

const BASE_TOLERANCE = 0.05;

export function deriveBaseYear(points: readonly InePoint[]): string | null {
  const byYear = new Map<string, number[]>();
  for (const point of points) {
    const year = point.period.slice(0, 4);
    const bucket = byYear.get(year);
    if (bucket) bucket.push(Number(point.indexValue));
    else byYear.set(year, [Number(point.indexValue)]);
  }

  const candidates = [...byYear.entries()]
    .filter(([, levels]) => levels.length === 12)
    .filter(([, levels]) => {
      const mean = levels.reduce((sum, v) => sum + v, 0) / levels.length;
      return Math.abs(mean - 100) < BASE_TOLERANCE;
    })
    .map(([year]) => year);

  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}
