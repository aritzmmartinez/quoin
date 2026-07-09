import Decimal from "decimal.js";

import type { Instrument, InstrumentType, Sleeve } from "~/core/domain";
import type { Position, TradeMeta } from "~/core/projections";
import { tradeMetaKey } from "~/core/projections";

import { instrumentTypeLabel } from "./i18n";

export interface PortfolioRow {
  key: string;
  instrumentId: string;
  name: string;
  type: InstrumentType | null;
  sleeve: Sleeve;
  currency: string | null;
  assetClass: string | null;
  quantity: string;
  averageCost: string;
  costBasis: string;
  realizedPnL: string;
  firstTradeAt: string | null;
  lastTradeAt: string | null;
  tradeCount: number;
}

export const SORT_KEYS = [
  "name",
  "type",
  "quantity",
  "averageCost",
  "costBasis",
  "realizedPnL",
] as const;

export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export interface Sort {
  key: SortKey;
  dir: SortDir;
}

const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  type: "asc",
  quantity: "desc",
  averageCost: "desc",
  costBasis: "desc",
  realizedPnL: "desc",
};

export const DEFAULT_SORT: Sort = {
  key: "costBasis",
  dir: DEFAULT_DIR.costBasis,
};

function isSortKey(value: string | null): value is SortKey {
  return value !== null && (SORT_KEYS as readonly string[]).includes(value);
}

export function parseSort(params: URLSearchParams): Sort {
  const rawKey = params.get("sort");
  const rawDir = params.get("dir");
  const key = isSortKey(rawKey) ? rawKey : DEFAULT_SORT.key;
  const dir: SortDir =
    rawDir === "asc" || rawDir === "desc" ? rawDir : DEFAULT_DIR[key];
  return { key, dir };
}

export function nextSort(key: SortKey, current: Sort): Sort {
  if (key === current.key) {
    return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: DEFAULT_DIR[key] };
}

export function toPortfolioRows(
  positions: readonly Position[],
  instruments: readonly Instrument[],
  tradeMeta: ReadonlyMap<string, TradeMeta>,
): PortfolioRow[] {
  const byId = new Map(instruments.map((i) => [i.id, i]));

  return positions
    .filter((p) => new Decimal(p.quantity).gt(0))
    .map((p) => {
      const instrument = byId.get(p.instrumentId);
      const meta = tradeMeta.get(tradeMetaKey(p.instrumentId, p.sleeve));
      return {
        key: tradeMetaKey(p.instrumentId, p.sleeve),
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
  "realizedPnL",
]);

function compareRows(a: PortfolioRow, b: PortfolioRow, key: SortKey): number {
  if (NUMERIC_KEYS.has(key)) {
    return new Decimal(a[key] as string).comparedTo(
      new Decimal(b[key] as string),
    );
  }
  if (key === "type") {
    const la = a.type ? instrumentTypeLabel(a.type) : "";
    const lb = b.type ? instrumentTypeLabel(b.type) : "";
    return la.localeCompare(lb, "es", { sensitivity: "base" });
  }
  return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
}

export function sortPortfolioRows(
  rows: readonly PortfolioRow[],
  sort: Sort,
): PortfolioRow[] {
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => factor * compareRows(a, b, sort.key));
}

export function totalInvested(rows: readonly PortfolioRow[]): string {
  return rows
    .reduce((sum, r) => sum.plus(new Decimal(r.costBasis)), new Decimal(0))
    .toFixed(2);
}
