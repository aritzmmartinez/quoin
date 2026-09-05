import Decimal from "decimal.js";

import { bloombergCurrency } from "~/adapters/identity/openfigi/currencies";
import { looksLikeCashRow } from "~/adapters/ingestion/holdings/numbers";
import { toExchangeCode, venueOf } from "~/adapters/identity/openfigi/venues";
import type { CachedIdentity } from "~/core/ports";
import type { Contribution, LeafExposure } from "~/core/projections";
import { leafTotal, leafWeight } from "~/core/projections";

export interface ExposureRow {
  key: string;
  kind: LeafExposure["leaf"]["kind"];
  id: string;
  name: string;
  value: string;
  weight: string | null;
  contributions: Contribution[];
  direct: string;
  via: string;
}

export const PRESENTATION_THRESHOLD = "0.005";
export const CONCENTRATION_THRESHOLD = "0.15";

export function isConcentrated(
  weight: string | null,
  threshold: string = CONCENTRATION_THRESHOLD,
): boolean {
  return weight !== null && new Decimal(weight).gt(threshold);
}

export interface Tail {
  count: number;
  value: string;
  weight: string | null;
}

export function toExposureRows(
  exposures: readonly LeafExposure[],
  total: string,
  threshold: string = PRESENTATION_THRESHOLD,
): ExposureRow[] {
  const rows: ExposureRow[] = [];

  for (const exposure of exposures) {
    const value = leafTotal(exposure);
    const weight = leafWeight(exposure, total);

    const alwaysShow = exposure.leaf.kind === "UNRESOLVED";
    if (!alwaysShow && weight !== null && new Decimal(weight).lt(threshold)) {
      continue;
    }

    rows.push({
      key: `${exposure.leaf.kind}:${exposure.leaf.id}`,
      kind: exposure.leaf.kind,
      id: exposure.leaf.id,
      name: exposure.name,
      value,
      weight,
      contributions: exposure.contributions,
      ...split(exposure, total),
    });
  }

  return rows;
}

export function tailOf(
  exposures: readonly LeafExposure[],
  total: string,
  threshold: string = PRESENTATION_THRESHOLD,
): Tail {
  const denominator = new Decimal(total);
  let value = new Decimal(0);
  let count = 0;

  for (const exposure of exposures) {
    if (exposure.leaf.kind === "UNRESOLVED") continue;
    const weight = leafWeight(exposure, total);
    if (weight === null || new Decimal(weight).gte(threshold)) continue;
    value = value.plus(new Decimal(leafTotal(exposure)));
    count += 1;
  }

  return {
    count,
    value: value.toFixed(2),
    weight: denominator.isZero() ? null : value.div(denominator).toFixed(6),
  };
}

function split(
  exposure: LeafExposure,
  total: string,
): { direct: string; via: string } {
  const denominator = new Decimal(total);
  if (denominator.isZero()) return { direct: "0", via: "0" };

  let direct = new Decimal(0);
  let via = new Decimal(0);
  for (const contribution of exposure.contributions) {
    const value = new Decimal(contribution.value);
    if (contribution.weightInParent === null) direct = direct.plus(value);
    else via = via.plus(value);
  }

  return {
    direct: direct.div(denominator).toFixed(6),
    via: via.div(denominator).toFixed(6),
  };
}

export interface Reading {
  name: string;
  total: string;
  direct: string;
  via: string;
  isOver: boolean;
  top3: string;
  leafCount: number;
}

export function readingFor(
  rows: readonly ExposureRow[],
  analysedCount: number,
  threshold: string = CONCENTRATION_THRESHOLD,
): Reading | null {
  const real = rows.filter((r) => r.kind !== "UNRESOLVED");
  const top = real[0];
  if (!top || top.weight === null) return null;

  const top3 = real
    .slice(0, 3)
    .reduce((sum, r) => sum.plus(new Decimal(r.weight ?? 0)), new Decimal(0));

  return {
    name: top.name,
    total: top.weight,
    direct: top.direct,
    via: top.via,
    isOver: isConcentrated(top.weight, threshold),
    top3: top3.toFixed(6),
    leafCount: analysedCount,
  };
}

function currencyOf(entry: CachedIdentity): string | null {
  if (entry.kind === "TICKER") {
    const fromVenue = bloombergCurrency(toExchangeCode(venueOf(entry.value)));
    if (fromVenue !== null) return fromVenue;
  }
  if (entry.resolution.status !== "resolved") return null;
  return bloombergCurrency(entry.resolution.exchCode);
}

export function currencyByLeaf(
  identities: ReadonlyMap<string, CachedIdentity>,
): Map<string, string> {
  const byLeaf = new Map<string, string>();
  const conflicted = new Set<string>();

  for (const entry of identities.values()) {
    const leafId =
      entry.resolution.status === "resolved"
        ? entry.resolution.canonicalId
        : entry.value;

    const currency = currencyOf(entry);
    if (currency === null) continue;

    const key = `COMPANY:${leafId}`;
    const known = byLeaf.get(key);
    if (known === undefined) {
      byLeaf.set(key, currency);
    } else if (known !== currency) {
      conflicted.add(key);
    }
  }

  for (const key of conflicted) byLeaf.delete(key);
  return byLeaf;
}

export function isCashLine(leafId: string, name: string): boolean {
  const base = leafId.split(".")[0] ?? "";
  return looksLikeCashRow(base, name);
}

export const ALLOCATION_VIEWS = [
  "exposicion",
  "rebalanceo",
  "divisa",
  "solapamiento",
] as const;
export type AllocationView = (typeof ALLOCATION_VIEWS)[number];
export const DEFAULT_ALLOCATION_VIEW: AllocationView = "exposicion";
export const VIEW_PARAM = "vista";

export const OVERLAP_MODES = ["lista", "matriz"] as const;
export type OverlapMode = (typeof OVERLAP_MODES)[number];
export const DEFAULT_OVERLAP_MODE: OverlapMode = "lista";
export const MODE_PARAM = "modo";

export const INCLUDE_SOLD_PARAM = "incluirVendidos";

export function parseAllocationView(params: URLSearchParams): AllocationView {
  const raw = params.get(VIEW_PARAM);
  return raw !== null && (ALLOCATION_VIEWS as readonly string[]).includes(raw)
    ? (raw as AllocationView)
    : DEFAULT_ALLOCATION_VIEW;
}

export function parseOverlapMode(params: URLSearchParams): OverlapMode {
  const raw = params.get(MODE_PARAM);
  return raw !== null && (OVERLAP_MODES as readonly string[]).includes(raw)
    ? (raw as OverlapMode)
    : DEFAULT_OVERLAP_MODE;
}

export function parseIncludeSold(params: URLSearchParams): boolean {
  return params.get(INCLUDE_SOLD_PARAM) === "1";
}

export function includeSoldHref(
  params: URLSearchParams,
  includeSold: boolean,
): string {
  const next = new URLSearchParams(params);
  if (includeSold) next.set(INCLUDE_SOLD_PARAM, "1");
  else next.delete(INCLUDE_SOLD_PARAM);
  return `?${next.toString()}`;
}

export function viewHref(
  params: URLSearchParams,
  view: AllocationView,
): string {
  const next = new URLSearchParams(params);
  if (view === DEFAULT_ALLOCATION_VIEW) next.delete(VIEW_PARAM);
  else next.set(VIEW_PARAM, view);
  if (view !== "solapamiento") {
    next.delete(MODE_PARAM);
    next.delete(INCLUDE_SOLD_PARAM);
  }
  return `?${next.toString()}`;
}

export function modeHref(params: URLSearchParams, mode: OverlapMode): string {
  const next = new URLSearchParams(params);
  if (mode === DEFAULT_OVERLAP_MODE) next.delete(MODE_PARAM);
  else next.set(MODE_PARAM, mode);
  return `?${next.toString()}`;
}

export const THRESHOLD_PARAM = "umbral";
export const THRESHOLD_MIN_PERCENT = 5;
export const THRESHOLD_MAX_PERCENT = 30;

export function parseThreshold(params: URLSearchParams): string {
  const raw = Number(params.get(THRESHOLD_PARAM));
  if (
    !Number.isFinite(raw) ||
    raw < THRESHOLD_MIN_PERCENT ||
    raw > THRESHOLD_MAX_PERCENT
  ) {
    return CONCENTRATION_THRESHOLD;
  }
  return new Decimal(raw).div(100).toString();
}

export function thresholdPercent(threshold: string): number {
  return new Decimal(threshold).times(100).toNumber();
}
