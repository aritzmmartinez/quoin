import Decimal from "decimal.js";

import type {
  Instrument,
  LedgerEvent,
  Thesis,
  TradeEvent,
} from "~/core/domain";
import { Money } from "~/core/domain";
import {
  WASH_SALE_WINDOW_MONTHS,
  carryforwardFrom,
  computeSavingsQuota,
  computeTaxHistory,
  fiscalYearOf,
  getTaxScale,
  taxYearOf,
  type CarryforwardStep,
  type RealizedGainDetail,
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
  next.set(REALIZED_VIEW_PARAM, "tax");
  next.set(TAX_YEAR_PARAM, String(year));
  return `?${next.toString()}`;
}

export function unlistedInstrumentIds(
  instruments: readonly Instrument[],
): Set<string> {
  return new Set(
    instruments.filter((i) => i.type === "CRYPTO").map((i) => i.id),
  );
}

export interface TaxLotRow {
  buyEventId: string;
  acquiredAt: string;
  quantity: string;
  unitCost: string;
}

export interface TaxRecipientRow {
  buyEventId: string;
  acquiredAt: string;
  quantity: string;
  deferredLoss: string;
}

export interface TaxWashSaleRow {
  before: string;
  remainingAfter: string;
  repurchaseBefore: string;
  repurchaseAfter: string;
  repurchased: string;
  fraction: string;
  recipients: TaxRecipientRow[];
}

export interface TaxSaleRow {
  id: string;
  t: string;
  instrumentId: string;
  name: string;
  thesis: Thesis;
  quantity: string;
  grossAmount: string;
  fees: string;
  costBasis: string;
  realizedPnL: string;
  computablePnL: string;
  nonComputable: string;
  carriedOver: string;
  washSale: TaxWashSaleRow | null;
  unlistedRepurchaseAt: string | null;
  lots: TaxLotRow[];
}

export interface TaxIntegrationRow {
  originEventId: string;
  originT: string;
  integratedByEventId: string;
  t: string;
  name: string;
  amount: string;
}

export interface TaxPendingRow {
  buyEventId: string;
  acquiredAt: string;
  name: string;
  amount: string;
  origins: { originEventId: string; originT: string; amount: string }[];
}

export type TaxCarryforwardRow = CarryforwardStep;

export interface TaxScaleView {
  source: string;
  brackets: TaxBracket[];
}

export interface TaxYearView {
  year: number;
  territory: Territory;
  washSaleWindowMonths: number;
  sales: TaxSaleRow[];
  affectedCount: number;
  ownNet: string;
  nonComputableSum: string;
  integratedSum: string;
  computableNet: string;
  integrations: TaxIntegrationRow[];
  pending: TaxPendingRow[];
  pendingSum: string;
  carryforward: TaxCarryforwardRow[];
  netSavingsBase: string;
  scale: TaxScaleView | null;
  quota: string | null;
}

export function buildTaxYearView(
  events: readonly LedgerEvent[],
  instruments: readonly Instrument[],
  year: number,
): TaxYearView {
  const byId = new Map(instruments.map((i) => [i.id, i]));
  const nameOf = (id: string): string => byId.get(id)?.name ?? id;

  const history = computeTaxHistory(events, {
    unlistedInstrumentIds: unlistedInstrumentIds(instruments),
  });
  const result = taxYearOf(history, year);
  const saleTs = new Map(history.gains.map((g) => [g.eventId, g.ts]));
  const originT = (id: string): string =>
    (saleTs.get(id) ?? new Date(0)).toISOString();

  const sales = result.gains
    .map((gain) => toSaleRow(gain, byId))
    .sort((a, b) => a.t.localeCompare(b.t));

  const integrations: TaxIntegrationRow[] = result.integrations.map((i) => ({
    originEventId: i.originEventId,
    originT: i.originTs.toISOString(),
    integratedByEventId: i.integratedByEventId,
    t: i.ts.toISOString(),
    name: nameOf(i.instrumentId),
    amount: i.amount,
  }));

  const pending: TaxPendingRow[] = result.pending.map((p) => ({
    buyEventId: p.buyEventId,
    acquiredAt: p.acquiredAt.toISOString(),
    name: nameOf(p.instrumentId),
    amount: sum(p.pieces.map((piece) => piece.amount)),
    origins: p.pieces.map((piece) => ({
      originEventId: piece.originEventId,
      originT: originT(piece.originEventId),
      amount: piece.amount,
    })),
  }));

  const carry = carryforwardFrom(history, year);
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
    washSaleWindowMonths: WASH_SALE_WINDOW_MONTHS,
    sales,
    affectedCount: sales.filter((s) => s.washSale !== null).length,
    ownNet: sum(
      result.gains.map((g) => g.realizedPnL),
      2,
    ),
    nonComputableSum: sum(
      result.gains.map((g) => g.nonComputable),
      2,
    ),
    integratedSum: sum(
      result.integrations.map((i) => i.amount),
      2,
    ),
    computableNet: result.computableNet,
    integrations,
    pending,
    pendingSum: sum(
      pending.map((p) => p.amount),
      2,
    ),
    carryforward: carry.steps,
    netSavingsBase: carry.netSavingsBase,
    scale: scale ? { source: scale.source, brackets: scale.brackets } : null,
    quota,
  };
}

function toSaleRow(
  gain: RealizedGainDetail,
  byId: ReadonlyMap<string, Instrument>,
): TaxSaleRow {
  return {
    id: gain.eventId,
    t: gain.ts.toISOString(),
    instrumentId: gain.instrumentId,
    name: byId.get(gain.instrumentId)?.name ?? gain.instrumentId,
    thesis: byId.get(gain.instrumentId)?.thesis ?? "CORE",
    quantity: gain.quantity,
    grossAmount: gain.grossAmount,
    fees: gain.fees,
    costBasis: gain.costBasis,
    realizedPnL: gain.realizedPnL,
    computablePnL: gain.computablePnL,
    nonComputable: gain.nonComputable,
    carriedOver: gain.carriedOver,
    washSale: gain.washSale && {
      before: gain.washSale.before,
      remainingAfter: gain.washSale.remainingAfter,
      repurchaseBefore: gain.washSale.repurchaseBefore,
      repurchaseAfter: gain.washSale.repurchaseAfter,
      repurchased: gain.washSale.repurchased,
      fraction: gain.washSale.fraction,
      recipients: gain.washSale.recipients.map((r) => ({
        buyEventId: r.buyEventId,
        acquiredAt: r.acquiredAt.toISOString(),
        quantity: r.quantity,
        deferredLoss: r.deferredLoss,
      })),
    },
    unlistedRepurchaseAt: gain.unlistedNotice?.buyTs.toISOString() ?? null,
    lots: gain.lots.map((lot) => ({
      buyEventId: lot.buyEventId,
      acquiredAt: lot.acquiredAt.toISOString(),
      quantity: lot.quantity,
      unitCost: lot.unitCost,
    })),
  };
}

function sum(values: readonly string[], decimals?: number): string {
  const total = values.reduce((acc, v) => acc.plus(v), new Decimal(0));
  return decimals === undefined ? total.toFixed() : total.toFixed(decimals);
}
