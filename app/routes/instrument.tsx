import { isRouteErrorResponse, Link, useRouteError } from "react-router";

import type { Route } from "./+types/instrument";

import Decimal from "decimal.js";

import {
  InstrumentHeader,
  InstrumentStats,
  InvestedVsValue,
  MovementsList,
  PriceChartWithTrades,
} from "~/components";
import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
} from "~/adapters/persistence";
import { Money, type TradeEvent } from "~/core/domain";
import {
  computeCostBasisTimeline,
  computeInvestedVsValueSeries,
  computePositions,
  computeReturns,
} from "~/core/projections";
import { es } from "~/lib";

const BASE_CURRENCY = "EUR";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Detalle de activo · Quoin" }];
}

export const handle = {
  title: (data: unknown): string =>
    (data as { instrument?: { name?: string } } | undefined)?.instrument
      ?.name ?? es.instrument.viewFallback,
};

export async function loader({ params }: Route.LoaderArgs) {
  const id = params.instrumentId;
  const now = new Date();

  const [instrument, events, history] = await Promise.all([
    new PrismaInstrumentRepository().get(id),
    new PrismaLedgerRepository().list(),
    new PrismaPriceRepository().historyFor(id),
  ]);
  if (!instrument) throw new Response("Not found", { status: 404 });

  const positions = computePositions(events).filter(
    (p) => p.instrumentId === id,
  );
  let quantity = new Decimal(0);
  let costBasis = Money.zero();
  const sleeves = positions.map((p) => p.sleeve);
  for (const p of positions) {
    quantity = quantity.plus(new Decimal(p.quantity));
    costBasis = costBasis.add(Money.fromString(p.costBasis));
  }

  const baseHistory = history.filter((s) => s.currency === BASE_CURRENCY);
  const latest = baseHistory.at(-1) ?? null;
  const currentPrice = latest ? latest.price : null;
  const priced = currentPrice !== null && quantity.gt(0);
  const marketValue = priced
    ? Money.fromString(currentPrice).scaleBy(quantity)
    : null;
  const unrealizedPnL = marketValue ? marketValue.subtract(costBasis) : null;

  const returns = computeReturns(events, id, currentPrice, now);

  const priceChartData = [
    ...computeCostBasisTimeline(events, id).map((pt) => ({
      t: new Date(pt.ts).getTime(),
      price: null as number | null,
      avgCost: Number(pt.avgCostAfter),
      buy: pt.side === "BUY" ? Number(pt.tradePrice) : null,
      sell: pt.side === "SELL" ? Number(pt.tradePrice) : null,
    })),
    ...baseHistory.map((s) => ({
      t: s.asOf.getTime(),
      price: Number(s.price),
      avgCost: null as number | null,
      buy: null as number | null,
      sell: null as number | null,
    })),
    ...(currentPrice !== null
      ? [
          {
            t: now.getTime(),
            price: Number(currentPrice),
            avgCost: null,
            buy: null,
            sell: null,
          },
        ]
      : []),
  ].sort((a, b) => a.t - b.t);

  const ivvData = computeInvestedVsValueSeries(
    events,
    id,
    baseHistory.map((s) => ({ asOf: s.asOf, price: s.price })),
    currentPrice,
    now,
  ).map((pt) => ({
    t: pt.t,
    invested: Number(pt.invested),
    value: Number(pt.value),
  }));

  const movements = events
    .filter(
      (e): e is TradeEvent =>
        (e.type === "BUY" || e.type === "SELL") && e.instrumentId === id,
    )
    .sort((a, b) => b.ts.getTime() - a.ts.getTime())
    .map((e) => {
      const qty = new Decimal(e.quantity);
      const amount = new Decimal(e.grossAmount).mul(e.fxToBase);
      return {
        t: e.ts.getTime(),
        side: e.type as "BUY" | "SELL",
        quantity: qty.toFixed(),
        price: qty.isZero() ? "0" : amount.div(qty).toString(),
        amount: amount.toString(),
      };
    });

  return {
    instrument: {
      id: instrument.id,
      name: instrument.name,
      type: instrument.type,
      sleeves,
      quantity: quantity.toFixed(),
      price: latest
        ? { value: latest.price, asOf: latest.asOf.toISOString() }
        : null,
      marketValue: marketValue?.toString() ?? null,
      unrealizedPnL: unrealizedPnL?.toString() ?? null,
    },
    kpis: returns,
    priceChartData,
    ivvData,
    movements,
    hasSymbol: Boolean(instrument.quoteSymbol),
  };
}

export default function Instrument({ loaderData }: Route.ComponentProps) {
  const { instrument, kpis, priceChartData, ivvData, movements } = loaderData;
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <InstrumentHeader instrument={instrument} />
      <InstrumentStats kpis={kpis} />
      <PriceChartWithTrades data={priceChartData} />
      <InvestedVsValue data={ivvData} />
      <MovementsList movements={movements} />
    </main>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const copy = notFound
    ? es.instrument.notFound
    : { title: es.portfolio.error.title, body: es.portfolio.error.body };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <Link
        to="/cartera"
        className="mb-4 inline-block text-[12.5px] text-muted transition-colors hover:text-text"
      >
        ← {es.instrument.back}
      </Link>
      <div className="rounded-card border border-border bg-surface px-6 py-16 text-center">
        <div className="text-[15px] font-semibold">{copy.title}</div>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted">
          {copy.body}
        </p>
      </div>
    </main>
  );
}
