import { isRouteErrorResponse, Link } from "react-router";

import type { Route } from "./+types/instrument";

import Decimal from "decimal.js";
import { SearchX } from "lucide-react";

import { ErrorBoundary as SharedErrorBoundary } from "~/components/ui/ErrorBoundary";
import { buttonClass } from "~/components/ui/Button";
import { ErrorState } from "~/components/ui/ErrorState";
import { Explainer } from "~/components/ui/Explainer";
import { UnratedNotice } from "~/components/ui/UnratedNotice";
import {
  Card,
  InstrumentHeader,
  InstrumentStats,
  MovementsTable,
} from "~/components";
import { InstrumentPriceChart } from "~/components/instrument/InstrumentPriceChart";
import { InstrumentValueChart } from "~/components/instrument/InstrumentValueChart";
import { buildPriceChartData } from "~/components/instrument/price-chart-data";
import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
} from "~/adapters/persistence";
import { Money } from "~/core/domain";
import { historyInBase, pricesInBase } from "~/core/fx";
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
import { loadRateBook } from "~/lib/rate-book.server";
import { unratedNames } from "~/lib/unrated";

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

  const book = await loadRateBook(history.map((s) => s.currency));
  const { history: baseHistory, unrated: unratedCloses } = historyInBase(
    history,
    book,
  );
  const last = history.at(-1);
  const current = pricesInBase(new Map(last ? [[id, last]] : []), book, now);
  const latest = current.prices.get(id) ?? null;
  const currentPrice = latest ? latest.price : null;
  const priced = currentPrice !== null && quantity.gt(0);
  const marketValue = priced
    ? Money.fromString(currentPrice).scaleBy(quantity)
    : null;
  const unrealizedPnL = marketValue ? marketValue.subtract(costBasis) : null;

  const returns = computeReturns(events, id, currentPrice, now);

  const priceChartData = buildPriceChartData(
    computeCostBasisTimeline(events, id),
    [
      ...baseHistory.map((s) => ({
        t: s.asOf.getTime(),
        price: Number(s.price),
      })),
      ...(currentPrice !== null
        ? [{ t: now.getTime(), price: Number(currentPrice) }]
        : []),
    ],
  );

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

  const { items: movements, info: movementsPage } = paginate(
    toMovementRows(events, [instrument], { instrumentId: id }),
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
    kpis: { ...returns, openCost: costBasis.toString() },
    priceChartData,
    ivvData,
    movements,
    movementsPage,
    hasSymbol: Boolean(instrument.quoteSymbol),
    unrated: unratedNames(current.unrated, [instrument], [id]),
    unratedCloses,
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
    unrated,
    unratedCloses,
  } = loaderData;
  return (
    <>
      <InstrumentHeader instrument={instrument} />
      <UnratedNotice unrated={unrated} className="mb-4" />
      <InstrumentStats kpis={kpis} />
      {unratedCloses > 0 && (
        <Explainer tone="notice" className="mb-4">
          {t.fx.unratedCloses(unratedCloses)}
        </Explainer>
      )}
      <InstrumentPriceChart data={priceChartData} unrated={unratedCloses > 0} />
      <InstrumentValueChart data={ivvData} />
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
