import Decimal from "decimal.js";

import type { LedgerEvent, TradeEvent } from "../domain";

export interface ReturnsSummary {
  twr: string | null;
  mwr: string | null;
  totalInvested: string;
  buyCount: number;
  avgBuyAmount: string;
}

interface CashFlow {
  t: number;
  amount: number;
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function isTrade(e: LedgerEvent): e is TradeEvent {
  return e.type === "BUY" || e.type === "SELL";
}

function baseAmount(value: string, fxToBase: string): Decimal {
  return new Decimal(value).mul(fxToBase);
}

function xirr(flows: readonly CashFlow[]): number | null {
  if (flows.length < 2) return null;
  const hasIn = flows.some((f) => f.amount > 0);
  const hasOut = flows.some((f) => f.amount < 0);
  if (!hasIn || !hasOut) return null;

  const t0 = Math.min(...flows.map((f) => f.t));
  const npv = (rate: number): number =>
    flows.reduce(
      (sum, f) => sum + f.amount / Math.pow(1 + rate, (f.t - t0) / YEAR_MS),
      0,
    );

  let lo = -0.9999;
  let hi = 10;
  let fLo = npv(lo);
  const fHi = npv(hi);
  if (fLo === 0) return lo;
  if (fHi === 0) return hi;
  if (fLo * fHi > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

export function computeReturns(
  events: readonly LedgerEvent[],
  instrumentId: string,
  currentPrice: string | null,
  now: Date = new Date(),
): ReturnsSummary {
  const trades = events
    .filter(isTrade)
    .filter((t) => t.instrumentId === instrumentId)
    .slice()
    .sort((a, b) => a.ts.getTime() - b.ts.getTime());

  const buys = trades.filter((t) => t.type === "BUY");
  const totalInvested = buys.reduce(
    (sum, b) => sum.plus(baseAmount(b.grossAmount, b.fxToBase)),
    new Decimal(0),
  );
  const buyCount = buys.length;
  const avgBuyAmount =
    buyCount === 0 ? new Decimal(0) : totalInvested.div(buyCount);

  let twr: string | null = null;
  let mwr: string | null = null;

  if (currentPrice !== null && trades.length > 0) {
    const price = new Decimal(currentPrice);

    const quantity = trades.reduce(
      (q, t) => (t.type === "BUY" ? q.plus(t.quantity) : q.minus(t.quantity)),
      new Decimal(0),
    );

    const marks: { t: number; price: Decimal }[] = trades.map((t) => ({
      t: t.ts.getTime(),
      price: new Decimal(t.quantity).isZero()
        ? new Decimal(0)
        : baseAmount(t.grossAmount, t.fxToBase).div(t.quantity),
    }));
    marks.push({ t: now.getTime(), price });

    let factor = new Decimal(1);
    let heldQty = new Decimal(0);
    let markIndex = 0;
    for (let i = 0; i < marks.length - 1; i++) {
      const trade = trades[markIndex];
      if (trade && marks[i]!.t === trade.ts.getTime()) {
        heldQty =
          trade.type === "BUY"
            ? heldQty.plus(trade.quantity)
            : heldQty.minus(trade.quantity);
        markIndex++;
      }
      const from = marks[i]!.price;
      const to = marks[i + 1]!.price;
      if (heldQty.gt(0) && from.gt(0)) {
        factor = factor.mul(to.div(from));
      }
    }
    twr = factor.minus(1).toFixed(6);

    const flows: CashFlow[] = [];
    for (const t of trades) {
      const gross = baseAmount(t.grossAmount, t.fxToBase);
      const fees = baseAmount(t.fees, t.fxToBase);
      if (t.type === "BUY") {
        flows.push({ t: t.ts.getTime(), amount: -gross.plus(fees).toNumber() });
      } else {
        flows.push({ t: t.ts.getTime(), amount: gross.minus(fees).toNumber() });
      }
    }
    const terminal = price.mul(quantity).toNumber();
    if (terminal !== 0) flows.push({ t: now.getTime(), amount: terminal });

    const rate = xirr(flows);
    mwr = rate === null ? null : new Decimal(rate).toFixed(6);
  }

  return {
    twr,
    mwr,
    totalInvested: totalInvested.toString(),
    buyCount,
    avgBuyAmount: avgBuyAmount.toString(),
  };
}
