import Decimal from "decimal.js";

import { Money } from "../domain";

import type { TradeEvent } from "../domain";

import type { FifoSale } from "./fifo";
import { fiscalYearOf } from "./fiscal-year";
import {
  createWashSaleAssessor,
  type UnlistedRepurchaseNotice,
  type WashSaleAssessment,
} from "./wash-sale";

export interface DeferredLossPiece {
  originEventId: string;
  amount: Money;
}

export interface DeferredLossShare {
  buyEventId: string;
  acquiredAt: Date;
  quantity: Decimal;
  pieces: DeferredLossPiece[];
}

export interface SaleDeferral {
  saleEventId: string;
  assessment: WashSaleAssessment | null;
  notice: UnlistedRepurchaseNotice | null;
  ownNonComputable: Money;
  ownComputable: Money;
  carriedIn: DeferredLossPiece[];
  integrated: DeferredLossPiece[];
  carriedOver: DeferredLossPiece[];
  shares: DeferredLossShare[];
}

export interface PendingDeferredLoss {
  buyEventId: string;
  acquiredAt: Date;
  pieces: DeferredLossPiece[];
}

export interface DeferredLossWalk {
  bySale: Map<string, SaleDeferral>;
  pendingByYear: Map<number, PendingDeferredLoss[]>;
}

interface LotDeferral {
  acquiredAt: Date;
  pieces: Map<string, Money>;
}

/**
 * V3282-18 (DGT, on art. 33.5.f LIRPF; parallel wording to Art. 43 NF
 * 13/2013): the non-computable loss is not lost. It stays with the securities
 * that acted as the repurchase and computes when they are transmitted with no
 * new repurchase in their own window; if that transmission trips the rule
 * again, the deferral moves on to the new repurchase.
 *
 * When the rule applies to a sale:
 *
 * - A loss sale of a listed security, always — its own loss is at stake.
 * - Any sale of units carrying a deferred loss, at a gain or at a loss.
 *   V1403-21: "para que la pérdida patrimonial originada pueda ser integrada a
 *   medida que se produzcan las posteriores transmisiones de los elementos
 *   patrimoniales que fueron recomprados, estas transmisiones, con
 *   independencia de que determinen ganancias o pérdidas patrimoniales, deben
 *   ser también definitivas [...] de tal forma que en el plazo marcado por la
 *   misma, dos meses en el supuesto de valores o participaciones que coticen,
 *   no se produzca la recompra de éstos." The quantities and the one-sale-per-
 *   unit allocation are the same as for a loss. A sale's own GAIN is never
 *   held back: the fraction applies only to the loss it carries.
 * - A sale at a gain carrying nothing is not assessed and claims no units.
 *
 * Then `carriedIn × fraction` moves to the recipients alongside the sale's own
 * deferred loss, and `carriedIn × (1 − fraction)` integrates in the year of
 * that sale, as a line of its own, never netted into its result.
 *
 * The deferral is a property of units, so it travels with the FIFO
 * consumption: a sale that takes part of a lot takes the same share of what
 * that lot carries. Units of one acquisition are indistinguishable (same day,
 * same cost), so within a lot the deferral is spread pro rata over the units
 * still held — own criterion, the DGT does not go below the security.
 *
 * Nothing is stored: this walks the whole ledger on every call, oldest sale
 * first, which is also the order repurchase units are assigned in.
 */
export function walkDeferredLosses(
  sales: readonly FifoSale[],
  trades: readonly TradeEvent[],
  unlistedInstrumentIds: ReadonlySet<string>,
): DeferredLossWalk {
  const assessor = createWashSaleAssessor(trades, unlistedInstrumentIds);
  const lots = new Map<string, LotDeferral>();
  const bySale = new Map<string, SaleDeferral>();
  const pendingByYear = new Map<number, PendingDeferredLoss[]>();

  sales.forEach((sale, index) => {
    const carriedIn = consume(sale, lots);
    const isLoss = sale.realizedPnL.isNegative();

    let assessment: WashSaleAssessment | null = null;
    let notice: UnlistedRepurchaseNotice | null = null;
    if (!assessor.isListed(sale.trade.instrumentId)) {
      notice = isLoss ? assessor.unlistedNotice(sale) : null;
    } else if (isLoss || carriedIn.length > 0) {
      assessment = assessor.assess(sale);
    }
    const fraction = assessment?.fraction ?? new Decimal(0);

    const ownNonComputable =
      isLoss && !fraction.isZero()
        ? sale.realizedPnL.scaleBy(fraction)
        : Money.zero();
    const carriedOver = carriedIn.map((p) => ({
      originEventId: p.originEventId,
      amount: p.amount.scaleBy(fraction),
    }));
    const integrated = carriedIn.map((p, i) => ({
      originEventId: p.originEventId,
      amount: p.amount.subtract(carriedOver[i]!.amount),
    }));

    const outgoing = nonZero([
      ...carriedOver,
      { originEventId: sale.trade.id, amount: ownNonComputable },
    ]);
    const shares =
      assessment && assessment.repurchased.gt(0)
        ? split(outgoing, assessment.recipients, assessment.repurchased)
        : [];
    for (const share of shares) attach(lots, share);

    bySale.set(sale.trade.id, {
      saleEventId: sale.trade.id,
      assessment,
      notice,
      ownNonComputable,
      ownComputable: sale.realizedPnL.subtract(ownNonComputable),
      carriedIn,
      integrated: nonZero(integrated),
      carriedOver: nonZero(carriedOver),
      shares,
    });

    const year = fiscalYearOf(sale.trade.ts);
    const next = sales[index + 1];
    if (!next || fiscalYearOf(next.trade.ts) !== year) {
      pendingByYear.set(year, snapshot(lots));
    }
  });

  return { bySale, pendingByYear };
}

function consume(
  sale: FifoSale,
  lots: Map<string, LotDeferral>,
): DeferredLossPiece[] {
  const taken = new Map<string, Money>();
  for (const consumption of sale.lots) {
    const lot = lots.get(consumption.lotId);
    if (!lot) continue;
    const left =
      sale.lotsAfter.find((l) => l.lotId === consumption.lotId)?.quantity ??
      new Decimal(0);
    const ratio = left.isZero()
      ? new Decimal(1)
      : consumption.quantity.dividedBy(consumption.quantity.plus(left));

    for (const [origin, amount] of lot.pieces) {
      const moved = ratio.equals(1) ? amount : amount.scaleBy(ratio);
      taken.set(origin, (taken.get(origin) ?? Money.zero()).add(moved));
      lot.pieces.set(origin, amount.subtract(moved));
    }
    if (left.isZero()) lots.delete(consumption.lotId);
  }
  return nonZero(
    [...taken].map(([originEventId, amount]) => ({ originEventId, amount })),
  );
}

function split(
  pieces: readonly DeferredLossPiece[],
  recipients: readonly {
    buyEventId: string;
    acquiredAt: Date;
    quantity: Decimal;
  }[],
  total: Decimal,
): DeferredLossShare[] {
  const shares: DeferredLossShare[] = recipients.map((r) => ({
    buyEventId: r.buyEventId,
    acquiredAt: r.acquiredAt,
    quantity: r.quantity,
    pieces: [],
  }));
  for (const piece of pieces) {
    let left = piece.amount;
    shares.forEach((share, i) => {
      const amount =
        i === shares.length - 1
          ? left
          : piece.amount.scaleBy(share.quantity.dividedBy(total));
      left = left.subtract(amount);
      share.pieces.push({ originEventId: piece.originEventId, amount });
    });
  }
  return shares;
}

function attach(
  lots: Map<string, LotDeferral>,
  share: DeferredLossShare,
): void {
  const lot = lots.get(share.buyEventId) ?? {
    acquiredAt: share.acquiredAt,
    pieces: new Map<string, Money>(),
  };
  for (const piece of share.pieces) {
    lot.pieces.set(
      piece.originEventId,
      (lot.pieces.get(piece.originEventId) ?? Money.zero()).add(piece.amount),
    );
  }
  lots.set(share.buyEventId, lot);
}

function snapshot(lots: Map<string, LotDeferral>): PendingDeferredLoss[] {
  return [...lots]
    .map(([buyEventId, lot]) => ({
      buyEventId,
      acquiredAt: lot.acquiredAt,
      pieces: nonZero(
        [...lot.pieces].map(([originEventId, amount]) => ({
          originEventId,
          amount,
        })),
      ),
    }))
    .filter((p) => p.pieces.length > 0)
    .sort((a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime());
}

function nonZero(pieces: readonly DeferredLossPiece[]): DeferredLossPiece[] {
  return pieces.filter((p) => !p.amount.isZero());
}
