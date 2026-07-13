import Decimal from "decimal.js";

import type { Instrument, InstrumentType, Sleeve } from "~/core/domain";
import type { MarketValue, Position, TradeMeta } from "~/core/projections";
import { tradeMetaKey } from "~/core/projections";

import { instrumentTypeLabel } from "./i18n";

/**
 * A single row of the portfolio table: a current position joined with its
 * instrument metadata, trade history and market-derived figures. Fully
 * serializable (strings / plain data only) so it crosses the loader -> component
 * boundary cleanly.
 *
 * Market fields are null when the instrument has no usable price (unmapped, or a
 * non-base-currency quote we don't convert yet).
 */
export interface PortfolioRow {
  /** Stable React key / join key: `instrumentId::sleeve`. */
  key: string;
  instrumentId: string; // ISIN (symbol for crypto)
  name: string;
  type: InstrumentType | null;
  sleeve: Sleeve;
  currency: string | null;
  assetClass: string | null;
  quantity: string;
  averageCost: string;
  costBasis: string;
  realizedPnL: string;
  marketValue: string | null;
  unrealizedPnL: string | null;
  weight: string | null; // fraction 0..1
  firstTradeAt: string | null; // ISO
  lastTradeAt: string | null; // ISO
  tradeCount: number;
}

export const SORT_KEYS = [
  "name",
  "type",
  "quantity",
  "averageCost",
  "costBasis",
  "marketValue",
  "unrealizedPnL",
  "weight",
] as const;

export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export interface Sort {
  key: SortKey;
  dir: SortDir;
}

/** Default direction per column: names read A→Z, magnitudes read big→small. */
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  type: "asc",
  quantity: "desc",
  averageCost: "desc",
  costBasis: "desc",
  marketValue: "desc",
  unrealizedPnL: "desc",
  weight: "desc",
};

/** Landing sort: heaviest holdings first (by portfolio weight). */
export const DEFAULT_SORT: Sort = { key: "weight", dir: DEFAULT_DIR.weight };

function isSortKey(value: string | null): value is SortKey {
  return value !== null && (SORT_KEYS as readonly string[]).includes(value);
}

/** Read a validated sort from URL search params, falling back to the default. */
export function parseSort(params: URLSearchParams): Sort {
  const rawKey = params.get("sort");
  const rawDir = params.get("dir");
  const key = isSortKey(rawKey) ? rawKey : DEFAULT_SORT.key;
  const dir: SortDir =
    rawDir === "asc" || rawDir === "desc" ? rawDir : DEFAULT_DIR[key];
  return { key, dir };
}

/**
 * Given a clicked column and the current sort, return the next sort: toggle
 * direction when clicking the active column, otherwise switch to the new column
 * at its natural default direction.
 */
export function nextSort(key: SortKey, current: Sort): Sort {
  if (key === current.key) {
    return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: DEFAULT_DIR[key] };
}

/**
 * Join current positions with instrument metadata, trade history and market
 * values. Closed positions (quantity 0) are excluded: this is a *holdings* view,
 * not a historical ledger. Pure and deterministic.
 */
export function toPortfolioRows(
  positions: readonly Position[],
  instruments: readonly Instrument[],
  tradeMeta: ReadonlyMap<string, TradeMeta>,
  marketValues: ReadonlyMap<string, MarketValue>,
): PortfolioRow[] {
  const byId = new Map(instruments.map((i) => [i.id, i]));

  return positions
    .filter((p) => new Decimal(p.quantity).gt(0))
    .map((p) => {
      const key = tradeMetaKey(p.instrumentId, p.sleeve);
      const instrument = byId.get(p.instrumentId);
      const meta = tradeMeta.get(key);
      const market = marketValues.get(key);
      return {
        key,
        instrumentId: p.instrumentId,
        name: instrument?.name ?? p.instrumentId,
        type: instrument?.type ?? null,
        sleeve: p.sleeve,
        currency: instrument?.currency ?? null,
        assetClass: instrument?.assetClass ?? null,
        quantity: p.quantity,
        averageCost: p.averageCost,
        costBasis: p.costBasis,
        realizedPnL: p.realizedPnL,
        marketValue: market?.marketValue ?? null,
        unrealizedPnL: market?.unrealizedPnL ?? null,
        weight: market?.weight ?? null,
        firstTradeAt: meta?.firstTradeAt.toISOString() ?? null,
        lastTradeAt: meta?.lastTradeAt.toISOString() ?? null,
        tradeCount: meta?.tradeCount ?? 0,
      };
    });
}

const NUMERIC_KEYS = new Set<SortKey>([
  "quantity",
  "averageCost",
  "costBasis",
  "marketValue",
  "unrealizedPnL",
  "weight",
]);

/** Compare two non-null row values for a key (numeric via Decimal, text via locale). */
function compareValues(a: PortfolioRow, b: PortfolioRow, key: SortKey): number {
  if (NUMERIC_KEYS.has(key)) {
    return new Decimal(a[key] as string).comparedTo(new Decimal(b[key] as string));
  }
  if (key === "type") {
    return instrumentTypeLabel(a.type as InstrumentType).localeCompare(
      instrumentTypeLabel(b.type as InstrumentType),
      "es",
      { sensitivity: "base" },
    );
  }
  return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
}

/**
 * Return a new array sorted by the given sort. Stable, non-mutating, and always
 * pushes rows with no value for that column (null) to the bottom regardless of
 * direction — so unpriced holdings never sit above priced ones.
 */
export function sortPortfolioRows(
  rows: readonly PortfolioRow[],
  sort: Sort,
): PortfolioRow[] {
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[sort.key];
    const bv = b[sort.key];
    const aNull = av === null || av === undefined;
    const bNull = bv === null || bv === undefined;
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;
    return factor * compareValues(a, b, sort.key);
  });
}

function sumOrNull(
  rows: readonly PortfolioRow[],
  field: "marketValue" | "unrealizedPnL",
): string | null {
  const priced = rows.filter((r) => r[field] !== null);
  if (priced.length === 0) return null;
  return priced
    .reduce((sum, r) => sum.plus(new Decimal(r[field] as string)), new Decimal(0))
    .toFixed(2);
}

/** Sum of invested amounts (cost basis) across rows, as a base-currency string. */
export function totalInvested(rows: readonly PortfolioRow[]): string {
  return rows
    .reduce((sum, r) => sum.plus(new Decimal(r.costBasis)), new Decimal(0))
    .toFixed(2);
}

/** Sum of market value across priced rows, or null if none are priced. */
export function totalMarketValue(rows: readonly PortfolioRow[]): string | null {
  return sumOrNull(rows, "marketValue");
}

/** Sum of unrealized P&L across priced rows, or null if none are priced. */
export function totalUnrealizedPnL(rows: readonly PortfolioRow[]): string | null {
  return sumOrNull(rows, "unrealizedPnL");
}
