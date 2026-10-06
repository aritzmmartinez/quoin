import Decimal from "decimal.js";

import { Money, type LedgerEvent, type Revalue } from "../domain";

import type { Territory } from "./config";
import {
  walkDeferredLosses,
  type DeferredLossPiece,
  type PendingDeferredLoss,
} from "./deferred-loss";
import { sortTrades, walkFifo, type FifoSale } from "./fifo";
import { fiscalYearOf } from "./fiscal-year";
import type { WashSaleAssessment, WashSaleWindow } from "./wash-sale";

export interface TaxOptions {
  unlistedInstrumentIds: ReadonlySet<string>;
  revalue?: Revalue;
}

export interface TaxLotConsumptionDetail {
  buyEventId: string;
  acquiredAt: Date;
  quantity: string;
  unitCost: string;
}

export interface DeferredLossAmount {
  originEventId: string;
  amount: string;
}

export interface WashSaleRecipientDetail {
  buyEventId: string;
  acquiredAt: Date;
  quantity: string;
  deferredLoss: string;
}

export interface WashSaleDetail {
  window: WashSaleWindow;
  before: string;
  remainingAfter: string;
  repurchaseBefore: string;
  repurchaseAfter: string;
  repurchased: string;
  fraction: string;
  recipients: WashSaleRecipientDetail[];
}

export interface UnlistedNoticeDetail {
  buyEventId: string;
  buyTs: Date;
}

export interface RealizedGainDetail {
  eventId: string;
  ts: Date;
  instrumentId: string;
  quantity: string;
  grossAmount: string;
  fees: string;
  costBasis: string;
  realizedPnL: string;
  lots: TaxLotConsumptionDetail[];
  computablePnL: string;
  nonComputable: string;
  carriedOver: string;
  washSale: WashSaleDetail | null;
  unlistedNotice: UnlistedNoticeDetail | null;
}

export interface DeferredLossIntegration {
  originEventId: string;
  originTs: Date;
  integratedByEventId: string;
  ts: Date;
  instrumentId: string;
  amount: string;
}

export interface PendingDeferredLossDetail {
  buyEventId: string;
  acquiredAt: Date;
  instrumentId: string;
  pieces: DeferredLossAmount[];
}

export interface TaxYearResult {
  year: number;
  territory: Territory;
  gains: RealizedGainDetail[];
  integrations: DeferredLossIntegration[];
  pending: PendingDeferredLossDetail[];
  computableNet: string;
}

export interface TaxHistory {
  gains: RealizedGainDetail[];
  integrations: DeferredLossIntegration[];
  pendingByYear: Map<number, PendingDeferredLossDetail[]>;
}

export function computeTaxHistory(
  events: readonly LedgerEvent[],
  options: TaxOptions,
): TaxHistory {
  const walk = walkFifo(events, options.revalue);
  const trades = sortTrades(events);
  const tradesById = new Map(trades.map((t) => [t.id, t]));
  const deferrals = walkDeferredLosses(
    walk.sales,
    trades,
    options.unlistedInstrumentIds,
  );

  const gains: RealizedGainDetail[] = [];
  const integrations: DeferredLossIntegration[] = [];

  for (const sale of walk.sales) {
    const deferral = deferrals.bySale.get(sale.trade.id)!;
    const { assessment, notice } = deferral;

    gains.push({
      ...saleFigures(sale),
      computablePnL: deferral.ownComputable.toString(),
      nonComputable: deferral.ownNonComputable.toString(),
      carriedOver: total(deferral.carriedOver).toString(),
      washSale:
        assessment && assessment.repurchased.gt(0)
          ? washSaleDetail(assessment, deferral.shares)
          : null,
      unlistedNotice: notice
        ? { buyEventId: notice.buyEventId, buyTs: notice.buyTs }
        : null,
    });

    for (const piece of deferral.integrated) {
      integrations.push({
        originEventId: piece.originEventId,
        originTs: tradesById.get(piece.originEventId)?.ts ?? sale.trade.ts,
        integratedByEventId: sale.trade.id,
        ts: sale.trade.ts,
        instrumentId: sale.trade.instrumentId,
        amount: piece.amount.toString(),
      });
    }
  }

  const pendingByYear = new Map(
    [...deferrals.pendingByYear].map(([year, pending]) => [
      year,
      pending.map((p) => pendingDetail(p, tradesById)),
    ]),
  );

  return { gains, integrations, pendingByYear };
}

export function taxYearOf(history: TaxHistory, year: number): TaxYearResult {
  const gains = history.gains.filter((g) => fiscalYearOf(g.ts) === year);
  const integrations = history.integrations.filter(
    (i) => fiscalYearOf(i.ts) === year,
  );

  let computableNet = new Decimal(0);
  for (const gain of gains)
    computableNet = computableNet.plus(gain.computablePnL);
  for (const i of integrations) computableNet = computableNet.plus(i.amount);

  const recorded = [...history.pendingByYear.keys()].filter((y) => y <= year);
  const pending =
    recorded.length > 0
      ? (history.pendingByYear.get(Math.max(...recorded)) ?? [])
      : [];

  return {
    year,
    territory: "bizkaia",
    gains,
    integrations,
    pending,
    computableNet: computableNet.toFixed(),
  };
}

export function computeTaxLots(
  events: readonly LedgerEvent[],
  year: number,
  options: TaxOptions,
): TaxYearResult {
  return taxYearOf(computeTaxHistory(events, options), year);
}

function saleFigures(
  sale: FifoSale,
): Omit<
  RealizedGainDetail,
  | "computablePnL"
  | "nonComputable"
  | "carriedOver"
  | "washSale"
  | "unlistedNotice"
> {
  return {
    eventId: sale.trade.id,
    ts: sale.trade.ts,
    instrumentId: sale.trade.instrumentId,
    quantity: sale.quantity.toFixed(),
    grossAmount: sale.gross.toString(),
    fees: sale.fees.toString(),
    costBasis: sale.costRemoved.toString(),
    realizedPnL: sale.realizedPnL.toString(),
    lots: sale.lots.map((lot) => ({
      buyEventId: lot.lotId,
      acquiredAt: lot.acquiredAt,
      quantity: lot.quantity.toFixed(),
      unitCost: lot.unitCost.toString(),
    })),
  };
}

function washSaleDetail(
  assessment: WashSaleAssessment,
  shares: readonly { buyEventId: string; pieces: DeferredLossPiece[] }[],
): WashSaleDetail {
  const deferredByBuy = new Map(
    shares.map((s) => [s.buyEventId, total(s.pieces)]),
  );
  return {
    window: assessment.window,
    before: assessment.before.toFixed(),
    remainingAfter: assessment.remainingAfter.toFixed(),
    repurchaseBefore: assessment.repurchaseBefore.toFixed(),
    repurchaseAfter: assessment.repurchaseAfter.toFixed(),
    repurchased: assessment.repurchased.toFixed(),
    fraction: assessment.fraction.toFixed(),
    recipients: assessment.recipients.map((r) => ({
      buyEventId: r.buyEventId,
      acquiredAt: r.acquiredAt,
      quantity: r.quantity.toFixed(),
      deferredLoss: (
        deferredByBuy.get(r.buyEventId) ?? Money.zero()
      ).toString(),
    })),
  };
}

function pendingDetail(
  pending: PendingDeferredLoss,
  tradesById: ReadonlyMap<string, { instrumentId: string }>,
): PendingDeferredLossDetail {
  return {
    buyEventId: pending.buyEventId,
    acquiredAt: pending.acquiredAt,
    instrumentId: tradesById.get(pending.buyEventId)?.instrumentId ?? "",
    pieces: pending.pieces.map((p) => ({
      originEventId: p.originEventId,
      amount: p.amount.toString(),
    })),
  };
}

function total(pieces: readonly DeferredLossPiece[]): Money {
  return pieces.reduce((sum, p) => sum.add(p.amount), Money.zero());
}
