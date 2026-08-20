import Decimal from "decimal.js";

import type { LedgerEvent, TradeEvent } from "../domain";
import type { InvestedVsValuePoint } from "./invested-vs-value";
import { xirr, type CashFlow } from "./xirr";

export interface ReturnsSummary {
  twr: string | null;
  mwr: string | null;
  totalInvested: string;
  buyCount: number;
  avgBuyAmount: string;
}

function isTrade(e: LedgerEvent): e is TradeEvent {
  return e.type === "BUY" || e.type === "SELL";
}

function baseAmount(value: string, fxToBase: string): Decimal {
  return new Decimal(value).mul(fxToBase);
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
    (sum, b) =>
      sum
        .plus(baseAmount(b.grossAmount, b.fxToBase))
        .plus(baseAmount(b.fees, b.fxToBase)),
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

export interface PortfolioReturnsSummary {
  twr: string | null;
  mwr: string | null;
}

const EMPTY_PORTFOLIO_RETURNS: PortfolioReturnsSummary = {
  twr: null,
  mwr: null,
};

interface PortfolioFlow {
  t: number;
  gross: Decimal;
  net: Decimal;
}

function portfolioFlows(events: readonly LedgerEvent[]): PortfolioFlow[] {
  return events
    .filter(isTrade)
    .map((t) => {
      const gross = baseAmount(t.grossAmount, t.fxToBase);
      const fees = baseAmount(t.fees, t.fxToBase);
      return t.type === "BUY"
        ? { t: t.ts.getTime(), gross, net: gross.plus(fees).neg() }
        : { t: t.ts.getTime(), gross: gross.neg(), net: gross.minus(fees) };
    })
    .sort((a, b) => a.t - b.t);
}

export function computePortfolioReturns(
  events: readonly LedgerEvent[],
  valueSeries: readonly InvestedVsValuePoint[],
): PortfolioReturnsSummary {
  const points = [...valueSeries].sort((a, b) => a.t - b.t);
  const last = points[points.length - 1];
  if (!last) return EMPTY_PORTFOLIO_RETURNS;

  const flows = portfolioFlows(events);
  if (flows.length === 0) return EMPTY_PORTFOLIO_RETURNS;

  return {
    twr: linkTwr(explainPortfolioTwr(events, points)),
    mwr: portfolioMwr(flows, new Decimal(last.value), last.t),
  };
}

export interface TwrSubPeriod {
  from: number;
  to: number;
  startValue: string;
  flow: string;
  endValue: string;
  ratio: string | null;
}

export function explainPortfolioTwr(
  events: readonly LedgerEvent[],
  valueSeries: readonly InvestedVsValuePoint[],
): TwrSubPeriod[] {
  const points = [...valueSeries].sort((a, b) => a.t - b.t);
  const flows = portfolioFlows(events);
  const rows: TwrSubPeriod[] = [];
  let cursor = 0;

  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i]!;
    const to = points[i + 1]!;

    let flow = new Decimal(0);
    while (cursor < flows.length && flows[cursor]!.t <= from.t) cursor += 1;
    let ahead = cursor;
    while (ahead < flows.length && flows[ahead]!.t <= to.t) {
      flow = flow.plus(flows[ahead]!.gross);
      ahead += 1;
    }
    cursor = ahead;

    const start = new Decimal(from.value);
    rows.push({
      from: from.t,
      to: to.t,
      startValue: from.value,
      flow: flow.toString(),
      endValue: to.value,
      ratio: start.lte(0)
        ? null
        : new Decimal(to.value).minus(flow).div(start).toString(),
    });
  }

  return rows;
}

function linkTwr(rows: readonly TwrSubPeriod[]): string | null {
  let factor = new Decimal(1);
  let linked = false;

  for (const row of rows) {
    if (row.ratio === null) continue;
    const ratio = new Decimal(row.ratio);
    if (ratio.lte(0)) return null;
    factor = factor.mul(ratio);
    linked = true;
  }

  return linked ? factor.minus(1).toFixed(6) : null;
}

function portfolioMwr(
  flows: readonly PortfolioFlow[],
  terminalValue: Decimal,
  terminalT: number,
): string | null {
  const cashFlows: CashFlow[] = flows.map((f) => ({
    t: f.t,
    amount: f.net.toNumber(),
  }));
  if (!terminalValue.isZero()) {
    cashFlows.push({ t: terminalT, amount: terminalValue.toNumber() });
  }

  const rate = xirr(cashFlows);
  return rate === null ? null : new Decimal(rate).toFixed(6);
}
