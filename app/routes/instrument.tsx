import { isRouteErrorResponse, Link } from "react-router";

import type { Route } from "./+types/instrument";

import Decimal from "decimal.js";
import { SearchX } from "lucide-react";

import { ErrorBoundary as SharedErrorBoundary } from "~/components/ui/ErrorBoundary";
import { buttonClass } from "~/components/ui/Button";
import { ErrorState } from "~/components/ui/ErrorState";
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
import {
  type Copy,
  copyFromMatches,
  paginate,
  parsePage,
  toMovementRows,
  useCopy,
} from "~/lib";

export function meta({ matches }: Route.MetaArgs) {
  const t = copyFromMatches(matches);
  return [{ title: t.meta.instrument.title }];
}

export const handle = {
  title: (t: Copy, data: unknown): string =>
    (data as { instrument?: { name?: string } } | undefined)?.instrument
      ?.name ?? t.instrument.viewFallback,
  parent: "/portfolio",
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
      thesis: instrument.thesis,
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
  const t = useCopy();
  const {
    instrument,
    kpis,
    priceChartData,
    ivvData,
    movements,
    movementsPage,
  } = loaderData;
  return (
    <>
      <InstrumentHeader instrument={instrument} />
      <InstrumentStats kpis={kpis} />
      <PriceChartWithTrades data={priceChartData} />
      <InvestedVsValue data={ivvData} />
      <Card className="overflow-hidden">
        <div className="px-gutter pb-3 pt-4 text-[14px] font-semibold">
          {t.instrument.movements.title}
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

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const t = useCopy();
  if (!isRouteErrorResponse(error) || error.status !== 404) {
    return <SharedErrorBoundary />;
  }

  return (
    <ErrorState
      icon={SearchX}
      tone="neutral"
      title={t.instrument.notFound.title}
      body={t.instrument.notFound.body}
    >
      <Link to="/portfolio" className={buttonClass()}>
        {t.instrument.notFound.back}
      </Link>
    </ErrorState>
  );
}
