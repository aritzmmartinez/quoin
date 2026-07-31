import { isRouteErrorResponse, Link, useRouteError } from "react-router";

import type { Route } from "./+types/instrument";

import Decimal from "decimal.js";

import {
  Card,
  InstrumentHeader,
  InstrumentStats,
  InvestedVsValue,
  MovementsTable,
  PriceChartWithTrades,
} from "~/components";
import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
} from "~/adapters/persistence";
import { BASE_CURRENCY, Money } from "~/core/domain";
import {
  computeCostBasisTimeline,
  computeInvestedVsValueSeries,
  computePositions,
  computeReturns,
} from "~/core/projections";
import { es, paginate, parsePage, toMovementRows } from "~/lib";


export function meta(_: Route.MetaArgs) {
  return [{ title: "Detalle de activo · Quoin" }];
}

export const handle = {
  title: (data: unknown): string =>
    (data as { instrument?: { name?: string } } | undefined)?.instrument
      ?.name ?? es.instrument.viewFallback,
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const id = params.instrumentId;
  const now = new Date();
  const page = parsePage(new URL(request.url).searchParams);

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

  // Shared with the global ledger: one definition of what a movement row is, so
  // both screens agree on fees, signs and price marks.
  const { items: movements, info: movementsPage } = paginate(
    toMovementRows(
      events.filter((e) => "instrumentId" in e && e.instrumentId === id),
      [instrument],
    ),
    page,
  );

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
    movementsPage,
    hasSymbol: Boolean(instrument.quoteSymbol),
  };
}

export default function Instrument({ loaderData }: Route.ComponentProps) {
  const { instrument, kpis, priceChartData, ivvData, movements, movementsPage } =
    loaderData;
  return (
    <>
      <InstrumentHeader instrument={instrument} />
      <InstrumentStats kpis={kpis} />
      <PriceChartWithTrades data={priceChartData} />
      <InvestedVsValue data={ivvData} />
      <Card className="overflow-hidden">
        <div className="px-5 pb-3 pt-4 text-[14px] font-semibold">
          {es.instrument.movements.title}
        </div>
        <MovementsTable
          rows={movements}
          info={movementsPage}
          showInstrument={false}
        />
      </Card>
    </>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const copy = notFound
    ? es.instrument.notFound
    : { title: es.portfolio.error.title, body: es.portfolio.error.body };

  return (
    <>
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
    </>
  );
}
