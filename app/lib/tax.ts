import Decimal from "decimal.js";

import type {
  Instrument,
  LedgerEvent,
  Sleeve,
  TradeEvent,
} from "~/core/domain";
import { Money } from "~/core/domain";
import {
  WASH_SALE_WINDOW_MONTHS,
  computeNetWithCarryforward,
  computeSavingsQuota,
  computeTaxLots,
  fiscalYearOf,
  getTaxScale,
  type CarryforwardStep,
  type TaxBracket,
  type Territory,
} from "~/core/tax";

import { REALIZED_VIEW_PARAM } from "./realized";

function isSellTrade(event: LedgerEvent): event is TradeEvent {
  return event.type === "SELL";
}

export function listTaxYears(events: readonly LedgerEvent[]): number[] {
  const years = new Set(
    events.filter(isSellTrade).map((e) => fiscalYearOf(e.ts)),
  );
  return [...years].sort((a, b) => b - a);
}

export const TAX_YEAR_PARAM = "year";

export function parseTaxYear(
  params: URLSearchParams,
  years: readonly number[],
  now: Date = new Date(),
): number | null {
  const raw = params.get(TAX_YEAR_PARAM);
  const requested = raw !== null ? Number(raw) : null;
  if (
    requested !== null &&
    Number.isInteger(requested) &&
    years.includes(requested)
  ) {
    return requested;
  }

  const current = fiscalYearOf(now);
  if (years.includes(current)) return current;
  return years[0] ?? null;
}

export function taxYearHref(params: URLSearchParams, year: number): string {
  const next = new URLSearchParams(params);
  next.set(REALIZED_VIEW_PARAM, "fiscal");
  next.set(TAX_YEAR_PARAM, String(year));
  return `?${next.toString()}`;
}

export interface TaxLotRow {
  buyEventId: string;
  acquiredAt: string;
  quantity: string;
  unitCost: string;
}

export interface TaxSaleRow {
  id: string;
  t: string;
  instrumentId: string;
  name: string;
  sleeve: Sleeve;
  quantity: string;
  grossAmount: string;
  fees: string;
  costBasis: string;
  realizedPnL: string;
  disallowed: boolean;
  disallowedReason: string | null;
  disallowedByBuyEventId: string | null;
  lots: TaxLotRow[];
}

export type TaxCarryforwardRow = CarryforwardStep;

export interface TaxScaleView {
  source: string;
  brackets: TaxBracket[];
}

export interface TaxYearView {
  year: number;
  territory: Territory;
  sales: TaxSaleRow[];
  allowedCount: number;
  disallowedCount: number;
  ownNetBeforeExclusion: string;
  disallowedSum: string;
  allowedNet: string;
  carryforward: TaxCarryforwardRow[];
  netSavingsBase: string;
  scale: TaxScaleView | null;
  quota: string | null;
}

function uiDisallowedReason(): string {
  return (
    `Recompra de valores homogéneos dentro de los ${WASH_SALE_WINDOW_MONTHS} ` +
    "meses de la venta: pérdida no deducible este año."
  );
}

export function buildTaxYearView(
  events: readonly LedgerEvent[],
  instruments: readonly Instrument[],
  year: number,
): TaxYearView {
  const names = new Map(instruments.map((i) => [i.id, i.name]));
  const result = computeTaxLots(events, year);

  const sales: TaxSaleRow[] = result.gains
    .map((gain) => ({
      id: gain.eventId,
      t: gain.ts.toISOString(),
      instrumentId: gain.instrumentId,
      name: names.get(gain.instrumentId) ?? gain.instrumentId,
      sleeve: gain.sleeve,
      quantity: gain.quantity,
      grossAmount: gain.grossAmount,
      fees: gain.fees,
      costBasis: gain.costBasis,
      realizedPnL: gain.realizedPnL,
      disallowed: gain.disallowed,
      disallowedReason: gain.disallowed ? uiDisallowedReason() : null,
      disallowedByBuyEventId: gain.disallowedByBuyEventId,
      lots: gain.lots.map((lot) => ({
        buyEventId: lot.buyEventId,
        acquiredAt: lot.acquiredAt.toISOString(),
        quantity: lot.quantity,
        unitCost: lot.unitCost,
      })),
    }))
    .sort((a, b) => a.t.localeCompare(b.t));

  const disallowedGains = result.gains.filter((g) => g.disallowed);
  const ownNetBeforeExclusion = result.gains
    .reduce((sum, g) => sum.plus(g.realizedPnL), new Decimal(0))
    .toFixed(2);
  const disallowedSum = disallowedGains
    .reduce((sum, g) => sum.plus(g.realizedPnL), new Decimal(0))
    .toFixed(2);

  const carry = computeNetWithCarryforward(events, year);
  const scale = getTaxScale(result.territory, year);
  const netBase = new Decimal(carry.netSavingsBase);
  const quota = scale
    ? (netBase.isPositive()
        ? computeSavingsQuota(Money.fromString(carry.netSavingsBase), scale)
        : Money.zero()
      ).toString()
    : null;

  return {
    year: result.year,
    territory: result.territory,
    sales,
    allowedCount: result.gains.length - disallowedGains.length,
    disallowedCount: disallowedGains.length,
    ownNetBeforeExclusion,
    disallowedSum,
    allowedNet: result.allowedNet,
    carryforward: carry.steps,
    netSavingsBase: carry.netSavingsBase,
    scale: scale ? { source: scale.source, brackets: scale.brackets } : null,
    quota,
  };
}
