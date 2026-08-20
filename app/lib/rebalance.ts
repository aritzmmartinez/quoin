import Decimal from "decimal.js";

import {
  deriveTargetWeights,
  type Instrument,
  type PortfolioTarget,
} from "~/core/domain";
import {
  computeRebalance,
  tradeMetaKey,
  type MarketValue,
  type Position,
  type RebalanceLine,
} from "~/core/projections";

export const DEFAULT_DRIFT_THRESHOLD = "0.02";
export const CONTRIBUTION_PARAM = "aportacion";
export const DRIFT_THRESHOLD_PARAM = "desvio";

const FORM_OWNED: readonly string[] = [
  CONTRIBUTION_PARAM,
  DRIFT_THRESHOLD_PARAM,
];

export function carriedParams(params: URLSearchParams): [string, string][] {
  return [...params].filter(([key]) => !FORM_OWNED.includes(key));
}

export function parseDriftThreshold(params: URLSearchParams): string {
  const raw = params.get(DRIFT_THRESHOLD_PARAM);
  if (raw === null || raw.trim() === "") return DEFAULT_DRIFT_THRESHOLD;

  let parsed: Decimal;
  try {
    parsed = new Decimal(raw.replace(",", "."));
  } catch {
    return DEFAULT_DRIFT_THRESHOLD;
  }
  if (!parsed.isFinite() || parsed.isNegative() || parsed.gt(50)) {
    return DEFAULT_DRIFT_THRESHOLD;
  }
  return parsed.div(100).toString();
}

export function parseContribution(params: URLSearchParams): string | null {
  const raw = params.get(CONTRIBUTION_PARAM);
  if (raw === null || raw.trim() === "") return null;

  let parsed: Decimal;
  try {
    parsed = new Decimal(raw.replace(",", "."));
  } catch {
    return null;
  }
  if (!parsed.isFinite() || parsed.isNegative()) return null;
  return parsed.toFixed(2);
}

export interface RebalanceRow {
  instrumentId: string;
  name: string;
  amount: string;
  share: string;
  currentValue: string;
  targetWeight: string;
  driftBefore: string;
  driftAfter: string;
}

export interface OffPlanRow {
  instrumentId: string;
  name: string;
  value: string;
}

export interface RebalancePlan {
  contribution: string;
  rows: RebalanceRow[];
  totalDriftBefore: string;
  totalDriftAfter: string;
  isOverThreshold: boolean;
  unpriced: string[];
  offPlan: OffPlanRow[];
}

interface Held {
  value: Decimal;
  unpriced: boolean;
}

export function buildRebalancePlan(
  target: PortfolioTarget,
  positions: readonly Position[],
  marketValues: ReadonlyMap<string, MarketValue>,
  instruments: readonly Instrument[],
  contribution: string,
  driftThreshold: string = DEFAULT_DRIFT_THRESHOLD,
): RebalancePlan {
  const byId = new Map(instruments.map((i) => [i.id, i]));
  const nameOf = (id: string): string => byId.get(id)?.name ?? id;

  const held = new Map<string, Held>();
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

  const weights = deriveTargetWeights(target);
  const planned = new Set(weights.map((w) => w.instrumentId));

  const unpriced: string[] = [];
  const lines: RebalanceLine[] = [];
  for (const weight of weights) {
    const entry = held.get(weight.instrumentId);
    if (entry?.unpriced) {
      unpriced.push(nameOf(weight.instrumentId));
      continue;
    }
    if (!new Decimal(weight.weight).gt(0)) continue;
    lines.push({
      instrumentId: weight.instrumentId,
      currentValue: (entry?.value ?? new Decimal(0)).toFixed(2),
      targetWeight: weight.weight,
    });
  }

  const offPlan: OffPlanRow[] = [];
  for (const [instrumentId, entry] of held) {
    if (planned.has(instrumentId) || !entry.value.gt(0)) continue;
    offPlan.push({
      instrumentId,
      name: nameOf(instrumentId),
      value: entry.value.toFixed(2),
    });
  }
  offPlan.sort((a, b) => new Decimal(b.value).comparedTo(a.value));

  const result = computeRebalance({ contribution, lines });
  const byInstrument = new Map(lines.map((l) => [l.instrumentId, l]));
  const total = new Decimal(contribution);

  const rows: RebalanceRow[] = result.allocations.map((allocation) => ({
    instrumentId: allocation.instrumentId,
    name: nameOf(allocation.instrumentId),
    amount: allocation.amount,
    share: total.isZero()
      ? "0"
      : new Decimal(allocation.amount).div(total).toFixed(6),
    currentValue:
      byInstrument.get(allocation.instrumentId)?.currentValue ?? "0",
    targetWeight:
      byInstrument.get(allocation.instrumentId)?.targetWeight ?? "0",
    driftBefore: allocation.driftBefore,
    driftAfter: allocation.driftAfter,
  }));
  rows.sort((a, b) => new Decimal(b.amount).comparedTo(a.amount));

  return {
    contribution,
    rows,
    totalDriftBefore: result.totalDriftBefore,
    totalDriftAfter: result.totalDriftAfter,
    isOverThreshold: new Decimal(result.totalDriftBefore).gt(driftThreshold),
    unpriced,
    offPlan,
  };
}
