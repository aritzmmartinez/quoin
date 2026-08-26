import Decimal from "decimal.js";

import type { Instrument, Sleeve } from "~/core/domain";
import type { RealizedSale } from "~/core/projections";

export interface RealizedRow {
  id: string;
  t: string;
  year: number;
  instrumentId: string;
  name: string;
  sleeve: Sleeve;
  quantity: string;
  price: string | null;
  grossAmount: string;
  fees: string;
  costBasis: string;
  realizedPnL: string;
  returnPct: string | null;
  holdingDays: number | null;
}

export const REALIZED_SORT_KEYS = [
  "date",
  "name",
  "quantity",
  "price",
  "grossAmount",
  "fees",
  "costBasis",
  "realizedPnL",
  "returnPct",
  "holdingDays",
] as const;

export type RealizedSortKey = (typeof REALIZED_SORT_KEYS)[number];
export type RealizedSortDir = "asc" | "desc";

export interface RealizedSort {
  key: RealizedSortKey;
  dir: RealizedSortDir;
}

const DEFAULT_DIR: Record<RealizedSortKey, RealizedSortDir> = {
  date: "desc",
  name: "asc",
  quantity: "desc",
  price: "desc",
  grossAmount: "desc",
  fees: "desc",
  costBasis: "desc",
  realizedPnL: "desc",
  returnPct: "desc",
  holdingDays: "desc",
};

export const DEFAULT_REALIZED_SORT: RealizedSort = {
  key: "date",
  dir: DEFAULT_DIR.date,
};

function isSortKey(value: string | null): value is RealizedSortKey {
  return (
    value !== null && (REALIZED_SORT_KEYS as readonly string[]).includes(value)
  );
}

export function parseRealizedSort(params: URLSearchParams): RealizedSort {
  const rawKey = params.get("sort");
  const rawDir = params.get("dir");
  const key = isSortKey(rawKey) ? rawKey : DEFAULT_REALIZED_SORT.key;
  const dir: RealizedSortDir =
    rawDir === "asc" || rawDir === "desc" ? rawDir : DEFAULT_DIR[key];
  return { key, dir };
}

export function nextRealizedSort(
  key: RealizedSortKey,
  current: RealizedSort,
): RealizedSort {
  if (key === current.key) {
    return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: DEFAULT_DIR[key] };
}

export function toRealizedRows(
  sales: readonly RealizedSale[],
  instruments: readonly Instrument[],
): RealizedRow[] {
  const byId = new Map(instruments.map((i) => [i.id, i]));

  return sales.map((sale) => ({
    id: sale.eventId,
    t: sale.ts.toISOString(),
    year: sale.ts.getFullYear(),
    instrumentId: sale.instrumentId,
    name: byId.get(sale.instrumentId)?.name ?? sale.instrumentId,
    sleeve: sale.sleeve,
    quantity: sale.quantity,
    price: sale.price,
    grossAmount: sale.grossAmount,
    fees: sale.fees,
    costBasis: sale.costBasis,
    realizedPnL: sale.realizedPnL,
    returnPct: sale.returnPct,
    holdingDays: sale.holdingDays,
  }));
}

const NUMERIC_KEYS = new Set<RealizedSortKey>([
  "quantity",
  "price",
  "grossAmount",
  "fees",
  "costBasis",
  "realizedPnL",
  "returnPct",
]);

function compareValues(
  a: RealizedRow,
  b: RealizedRow,
  key: RealizedSortKey,
): number {
  if (key === "date") return a.t.localeCompare(b.t);
  if (key === "name")
    return a.name.localeCompare(b.name, "es", {
      sensitivity: "base",
    });
  if (key === "holdingDays") return (a.holdingDays ?? 0) - (b.holdingDays ?? 0);
  if (NUMERIC_KEYS.has(key)) {
    return new Decimal(a[key] as string).comparedTo(
      new Decimal(b[key] as string),
    );
  }
  return 0;
}

export function sortRealizedRows(
  rows: readonly RealizedRow[],
  sort: RealizedSort,
): RealizedRow[] {
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[sort.key === "date" ? "t" : sort.key];
    const bv = b[sort.key === "date" ? "t" : sort.key];
    const aNull = av === null || av === undefined;
    const bNull = bv === null || bv === undefined;
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;
    return factor * compareValues(a, b, sort.key);
  });
}

export interface RealizedTotals {
  count: number;
  grossAmount: string;
  fees: string;
  costBasis: string;
  realizedPnL: string;
  returnPct: string | null;
}

function sum(rows: readonly RealizedRow[], field: keyof RealizedRow): Decimal {
  return rows.reduce(
    (total, row) => total.plus(new Decimal(row[field] as string)),
    new Decimal(0),
  );
}

export function realizedTotals(rows: readonly RealizedRow[]): RealizedTotals {
  const costBasis = sum(rows, "costBasis");
  const realizedPnL = sum(rows, "realizedPnL");

  return {
    count: rows.length,
    grossAmount: sum(rows, "grossAmount").toFixed(2),
    fees: sum(rows, "fees").toFixed(2),
    costBasis: costBasis.toFixed(2),
    realizedPnL: realizedPnL.toFixed(2),
    returnPct: costBasis.isZero()
      ? null
      : realizedPnL.div(costBasis).toFixed(6),
  };
}

export const REALIZED_VIEWS = ["ventas", "fiscal"] as const;
export type RealizedView = (typeof REALIZED_VIEWS)[number];
export const DEFAULT_REALIZED_VIEW: RealizedView = "ventas";
export const REALIZED_VIEW_PARAM = "vista";

export function parseRealizedView(params: URLSearchParams): RealizedView {
  const raw = params.get(REALIZED_VIEW_PARAM);
  return raw !== null && (REALIZED_VIEWS as readonly string[]).includes(raw)
    ? (raw as RealizedView)
    : DEFAULT_REALIZED_VIEW;
}

export function realizedViewHref(
  params: URLSearchParams,
  view: RealizedView,
): string {
  const next = new URLSearchParams(params);
  if (view === DEFAULT_REALIZED_VIEW) {
    next.delete(REALIZED_VIEW_PARAM);
    next.delete("year");
  } else {
    next.set(REALIZED_VIEW_PARAM, view);
  }
  return `?${next.toString()}`;
}

export interface RealizedYear {
  year: number;
  rows: RealizedRow[];
  totals: RealizedTotals;
}

export function groupRealizedByYear(
  rows: readonly RealizedRow[],
  sort: RealizedSort,
): RealizedYear[] {
  const byYear = new Map<number, RealizedRow[]>();
  for (const row of rows) {
    const bucket = byYear.get(row.year);
    if (bucket) bucket.push(row);
    else byYear.set(row.year, [row]);
  }

  const ascending = sort.key === "date" && sort.dir === "asc";

  return [...byYear.entries()]
    .sort(([a], [b]) => (ascending ? a - b : b - a))
    .map(([year, yearRows]) => ({
      year,
      rows: sortRealizedRows(yearRows, sort),
      totals: realizedTotals(yearRows),
    }));
}
