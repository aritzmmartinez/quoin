import Decimal from "decimal.js";

import type {
  Instrument,
  InstrumentType,
  LedgerEvent,
  Thesis,
  TradeEvent,
} from "~/core/domain";
import { dayOf, fiscalYearOf, toIsoDate } from "~/core/calendar";
import { Money, isInKind, type DividendEvent } from "~/core/domain";
import { baseOf, bookable, unconvertibleInstrumentIds } from "~/core/fx";
import {
  carryforwardFrom,
  computeSavingsQuota,
  computeTaxHistory,
  getTaxScale,
  taxYearOf,
  type CarryforwardStep,
  type RealizedGainDetail,
  type RepurchaseAssetClass,
  type RepurchaseLetter,
  type TaxBracket,
  type Jurisdiction,
  type TaxOptions,
  type Territory,
} from "~/core/tax";

import { namesOf } from "./opportunity-cost";
import { REALIZED_VIEW_PARAM } from "./realized";

function isSellTrade(event: LedgerEvent): event is TradeEvent {
  return event.type === "SELL";
}

function isInKindIncome(event: LedgerEvent): event is DividendEvent {
  return event.type === "DIVIDEND" && isInKind(event);
}

export function taxExclusions(
  events: readonly LedgerEvent[],
  instruments: readonly Instrument[],
): string[] {
  return namesOf(unconvertibleInstrumentIds(events), instruments);
}

export function unclassifiedSales(
  events: readonly LedgerEvent[],
  instruments: readonly Instrument[],
): string[] {
  const unclassified = new Set(
    instruments
      .filter((i) => repurchaseAssetClassOf(i.type) === "unclassified")
      .map((i) => i.id),
  );
  const sold = new Set(
    events
      .filter(isSellTrade)
      .map((e) => e.instrumentId)
      .filter((id) => unclassified.has(id)),
  );
  return namesOf([...sold].sort(), instruments);
}

export function listTaxYears(
  events: readonly LedgerEvent[],
  zone: string,
): number[] {
  const years = new Set(
    events
      .filter((e) => isSellTrade(e) || isInKindIncome(e))
      .map((e) => fiscalYearOf(e.ts, zone)),
  );
  return [...years].sort((a, b) => b - a);
}

export const TAX_YEAR_PARAM = "year";

export function parseTaxYear(
  params: URLSearchParams,
  years: readonly number[],
  zone: string,
  now: Date,
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

  const current = fiscalYearOf(now, zone);
  if (years.includes(current)) return current;
  return years[0] ?? null;
}

export function taxYearHref(params: URLSearchParams, year: number): string {
  const next = new URLSearchParams(params);
  next.set(REALIZED_VIEW_PARAM, "tax");
  next.set(TAX_YEAR_PARAM, String(year));
  return `?${next.toString()}`;
}

export function repurchaseAssetClassOf(
  type: InstrumentType,
): RepurchaseAssetClass {
  switch (type) {
    case "ETF":
    case "STOCK":
      return "listed-security";
    case "CRYPTO":
      return "fungible-crypto";
    case "BOND":
    case "COMMODITY":
    case "CASH":
      return "unclassified";
    default: {
      const unclassified: never = type;
      throw new Error(`No repurchase asset class for type ${unclassified}`);
    }
  }
}

export function repurchaseAssetClasses(
  instruments: readonly Instrument[],
): Map<string, RepurchaseAssetClass> {
  return new Map(
    instruments.map((i) => [i.id, repurchaseAssetClassOf(i.type)]),
  );
}

export function taxOptionsFor(
  instruments: readonly Instrument[],
  jurisdiction: Jurisdiction,
): TaxOptions {
  return {
    ...jurisdiction,
    assetClasses: repurchaseAssetClasses(instruments),
  };
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
  letter: RepurchaseLetter;
  windowMonths: number;
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
  deferralMinor: boolean;
  windowOpenUntil: string | null;
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
  instrumentId: string;
  name: string;
  amount: string;
  origins: { originEventId: string; originT: string; amount: string }[];
}

const HALF_CENT = new Decimal("0.005");

function roundsToNothing(value: string): boolean {
  return new Decimal(value).abs().lt(HALF_CENT);
}

export function isBelowCent(value: string): boolean {
  return !new Decimal(value).isZero() && roundsToNothing(value);
}

export interface TaxPendingAcquisition {
  buyEventId: string;
  acquiredAt: string;
  amount: string;
}

export interface TaxPendingGroup {
  key: string;
  instrumentId: string;
  name: string;
  saleT: string;
  amount: string;
  acquisitions: TaxPendingAcquisition[];
}

export function groupPendingBySale(
  rows: readonly TaxPendingRow[],
  zone: string,
): TaxPendingGroup[] {
  const groups = new Map<string, TaxPendingGroup>();
  for (const row of rows) {
    for (const origin of row.origins) {
      const key = `${row.instrumentId}|${dayOf(new Date(origin.originT), zone)}`;
      const group = groups.get(key) ?? {
        key,
        instrumentId: row.instrumentId,
        name: row.name,
        saleT: origin.originT,
        amount: "0",
        acquisitions: [],
      };
      if (origin.originT < group.saleT) group.saleT = origin.originT;
      group.amount = new Decimal(group.amount).plus(origin.amount).toFixed();
      group.acquisitions.push({
        buyEventId: row.buyEventId,
        acquiredAt: row.acquiredAt,
        amount: origin.amount,
      });
      groups.set(key, group);
    }
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      acquisitions: group.acquisitions.sort((a, b) =>
        a.acquiredAt.localeCompare(b.acquiredAt),
      ),
    }))
    .sort(
      (a, b) => a.saleT.localeCompare(b.saleT) || a.name.localeCompare(b.name),
    );
}

export type TaxCarryforwardRow = CarryforwardStep;

export interface TaxInKindIncome {
  count: number;
  gross: string;
  withheld: string;
}

export function inKindIncomeOf(
  events: readonly LedgerEvent[],
  year: number,
  zone: string,
): TaxInKindIncome {
  const received = bookable(events).filter(
    (e): e is DividendEvent =>
      isInKindIncome(e) && fiscalYearOf(e.ts, zone) === year,
  );
  return {
    count: received.length,
    gross: sum(
      received.map((e) => baseOf(e, "grossAmount").toString()),
      2,
    ),
    withheld: sum(
      received.map((e) => baseOf(e, "taxWithheld").toString()),
      2,
    ),
  };
}

export interface TaxScaleView {
  source: string;
  brackets: TaxBracket[];
}

export interface TaxYearView {
  year: number;
  territory: Territory;
  sales: TaxSaleRow[];
  affectedCount: number;
  ownNet: string;
  nonComputableSum: string;
  integratedSum: string;
  computableNet: string;
  integrations: TaxIntegrationRow[];
  pending: TaxPendingRow[];
  pendingBySale: TaxPendingGroup[];
  pendingSum: string;
  carryforward: TaxCarryforwardRow[];
  netSavingsBase: string;
  scale: TaxScaleView | null;
  quota: string | null;
  inKindIncome: TaxInKindIncome;
}

export function buildTaxYearView(
  events: readonly LedgerEvent[],
  instruments: readonly Instrument[],
  year: number,
  jurisdiction: Jurisdiction,
  today: string,
): TaxYearView {
  const byId = new Map(instruments.map((i) => [i.id, i]));
  const nameOf = (id: string): string => byId.get(id)?.name ?? id;

  const history = computeTaxHistory(
    events,
    taxOptionsFor(instruments, jurisdiction),
  );
  const result = taxYearOf(history, year);
  const saleTs = new Map(history.gains.map((g) => [g.eventId, g.ts]));
  const originT = (id: string): string =>
    (saleTs.get(id) ?? new Date(0)).toISOString();

  const sales = result.gains
    .map((gain) => toSaleRow(gain, byId, today))
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
    instrumentId: p.instrumentId,
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
    pendingBySale: groupPendingBySale(pending, jurisdiction.zone),
    pendingSum: sum(
      pending.map((p) => p.amount),
      2,
    ),
    carryforward: carry.steps,
    netSavingsBase: carry.netSavingsBase,
    scale: scale ? { source: scale.source, brackets: scale.brackets } : null,
    quota,
    inKindIncome: inKindIncomeOf(events, year, jurisdiction.zone),
  };
}

export function windowOpenUntil(
  gain: RealizedGainDetail,
  today: string,
): string | null {
  if (!gain.repurchaseWindow || !new Decimal(gain.realizedPnL).isNegative())
    return null;
  const end = toIsoDate(gain.repurchaseWindow.window.end);
  return today <= end ? end : null;
}

function toSaleRow(
  gain: RealizedGainDetail,
  byId: ReadonlyMap<string, Instrument>,
  today: string,
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
      letter: gain.washSale.letter,
      windowMonths: gain.washSale.windowMonths,
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
    deferralMinor:
      gain.washSale !== null &&
      roundsToNothing(gain.nonComputable) &&
      roundsToNothing(gain.carriedOver),
    windowOpenUntil: windowOpenUntil(gain, today),
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
