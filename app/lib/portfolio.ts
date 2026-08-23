import Decimal from "decimal.js";

import type { Instrument, InstrumentType, Sleeve } from "~/core/domain";
import type { MarketValue, Position, TradeMeta } from "~/core/projections";
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
  marketValue: string | null;
  unrealizedPnL: string | null;
  weight: string | null;
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

export const DEFAULT_SORT: Sort = { key: "weight", dir: DEFAULT_DIR.weight };

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

function compareValues(a: PortfolioRow, b: PortfolioRow, key: SortKey): number {
  if (NUMERIC_KEYS.has(key)) {
    return new Decimal(a[key] as string).comparedTo(
      new Decimal(b[key] as string),
    );
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
    .reduce(
      (sum, r) => sum.plus(new Decimal(r[field] as string)),
      new Decimal(0),
    )
    .toFixed(2);
}

export function totalInvested(rows: readonly PortfolioRow[]): string {
  return rows
    .reduce((sum, r) => sum.plus(new Decimal(r.costBasis)), new Decimal(0))
    .toFixed(2);
}

export function totalMarketValue(rows: readonly PortfolioRow[]): string | null {
  return sumOrNull(rows, "marketValue");
}
export function totalUnrealizedPnL(
  rows: readonly PortfolioRow[],
): string | null {
  return sumOrNull(rows, "unrealizedPnL");
}

export interface HeldValue {
  value: Decimal;
  unpriced: boolean;
}

export function heldValuesByInstrument(
  positions: readonly Position[],
  marketValues: ReadonlyMap<string, MarketValue>,
): Map<string, HeldValue> {
  const held = new Map<string, HeldValue>();

  for (const position of positions) {
    if (!new Decimal(position.quantity).gt(0)) continue;
    const market = marketValues.get(
      tradeMetaKey(position.instrumentId, position.sleeve),
    );
    const entry = held.get(position.instrumentId) ?? {
      value: new Decimal(0),
      unpriced: false,
    };
    if (market?.marketValue == null) entry.unpriced = true;
    else entry.value = entry.value.plus(market.marketValue);
    held.set(position.instrumentId, entry);
  }

  return held;
}
