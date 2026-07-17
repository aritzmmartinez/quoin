import Decimal from "decimal.js";

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
  isGrouped: boolean;
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

export function toExposureRows(
  exposures: readonly LeafExposure[],
  total: string,
  threshold: string = PRESENTATION_THRESHOLD,
): ExposureRow[] {
  const rows: ExposureRow[] = [];
  let tail = new Decimal(0);
  let tailCount = 0;

  for (const exposure of exposures) {
    const value = leafTotal(exposure);
    const weight = leafWeight(exposure, total);

    const alwaysShow = exposure.leaf.kind === "UNRESOLVED";
    if (!alwaysShow && weight !== null && new Decimal(weight).lt(threshold)) {
      tail = tail.plus(new Decimal(value));
      tailCount += 1;
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
      isGrouped: false,
      ...split(exposure, total),
    });
  }

  if (tailCount > 0) {
    const denominator = new Decimal(total);
    rows.push({
      key: "__tail__",
      kind: "COMPANY",
      id: "",
      name: "",
      value: tail.toFixed(2),
      direct: "0",
      via: "0",
      weight: denominator.isZero() ? null : tail.div(denominator).toFixed(6),
      contributions: [],
      isGrouped: true,
    });
  }

  return rows;
}

export function tailCount(
  exposures: readonly LeafExposure[],
  total: string,
  threshold: string = PRESENTATION_THRESHOLD,
): number {
  return exposures.filter((e) => {
    if (e.leaf.kind === "UNRESOLVED") return false;
    const weight = leafWeight(e, total);
    return weight !== null && new Decimal(weight).lt(threshold);
  }).length;
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
  threshold: string = CONCENTRATION_THRESHOLD,
): Reading | null {
  const real = rows.filter((r) => !r.isGrouped && r.kind !== "UNRESOLVED");
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
    leafCount: real.length,
  };
}

export const THRESHOLD_PARAM = "umbral";

export function parseThreshold(params: URLSearchParams): string {
  const raw = Number(params.get(THRESHOLD_PARAM));
  if (!Number.isFinite(raw) || raw < 5 || raw > 30)
    return CONCENTRATION_THRESHOLD;
  return new Decimal(raw).div(100).toString();
}
