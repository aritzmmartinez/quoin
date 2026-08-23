import type { Route } from "./+types/summary";

import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
} from "~/adapters/persistence";
import {
  AllocationCard,
  BasisNotice,
  Card,
  PortfolioEmpty,
  PortfolioError,
  PortfolioValueChart,
  SummaryHero,
  SummaryReturns,
  SummaryStats,
  TopPositionsCard,
  type AllocationRow,
  type TopPositionRow,
} from "~/components";
import {
  computeAllocation,
  computeInvestedVsValueSeries,
  computeMarketValues,
  computePortfolioInvestedVsValueSeries,
  computePortfolioReturns,
  computePortfolioSummary,
  computePositions,
  computeTopPositions,
  computeWeightedTer,
} from "~/core/projections";
import {
  computeHeroChange,
  es,
  filterByRange,
  heldValuesByInstrument,
  instrumentTypeLabel,
  parseRange,
} from "~/lib";

import {
  BASE_CURRENCY,
  type InstrumentType,
  type Revalue,
} from "~/core/domain";
import { loadOpportunityCost } from "~/lib/opportunity-cost.server";
import { resolveRealView } from "~/lib/real.server";

const TOP_POSITIONS = 5;

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Resumen · Quoin" },
    { name: "description", content: "Valor y evolución de tu cartera" },
  ];
}

export const handle = { title: es.summary.title, range: true, basis: true };

export async function loader({ request }: Route.LoaderArgs) {
  const range = parseRange(new URL(request.url).searchParams);
  const priceRepository = new PrismaPriceRepository();

  const [events, instruments, prices] = await Promise.all([
    new PrismaLedgerRepository().list(),
    new PrismaInstrumentRepository().list(),
    priceRepository.latest(),
  ]);

  const real = await resolveRealView(request, events);
  const positions = computePositions(events, real.revalue);
  const marketValues = computeMarketValues(positions, prices, BASE_CURRENCY);
  const summary = computePortfolioSummary(positions, marketValues);

  const instrumentsById = new Map(instruments.map((i) => [i.id, i]));
  const categories = new Map(instruments.map((i) => [i.id, i.type]));

  const allocation: AllocationRow[] = computeAllocation(
    positions,
    marketValues,
    categories,
  ).map((slice) => ({
    ...slice,
    label: instrumentTypeLabel(slice.category as InstrumentType),
  }));

  const top: TopPositionRow[] = computeTopPositions(
    positions,
    marketValues,
    TOP_POSITIONS,
  ).map((row) => ({
    instrumentId: row.instrumentId,
    name: instrumentsById.get(row.instrumentId)?.name ?? row.instrumentId,
    sleeve: row.sleeve,
    marketValue: row.marketValue,
    weight: row.weight,
    unrealizedPnLPct: row.unrealizedPnLPct,
  }));

  const heldIds = [...new Set(positions.map((p) => p.instrumentId))];
  const histories = await Promise.all(
    heldIds.map((id) => priceRepository.historyFor(id)),
  );

  const now = new Date();
  const buildSeries = (revalue?: Revalue) =>
    computePortfolioInvestedVsValueSeries(
      heldIds.map((id, index) =>
        computeInvestedVsValueSeries(
          events,
          id,
          (histories[index] ?? [])
            .filter((snapshot) => snapshot.currency === BASE_CURRENCY)
            .map((snapshot) => ({
              asOf: snapshot.asOf,
              price: snapshot.price,
            })),
          prices.get(id)?.currency === BASE_CURRENCY
            ? (prices.get(id)?.price ?? null)
            : null,
          now,
          revalue,
        ),
      ),
    );

  const portfolioSeries = buildSeries(real.revalue);
  const series = filterByRange(portfolioSeries, range, now);

  const returns = computePortfolioReturns(
    events,
    real.revalue ? buildSeries() : portfolioSeries,
  );

  const opportunity = await loadOpportunityCost(
    events,
    instruments,
    prices,
    undefined,
    now,
  );

  const ter = computeWeightedTer(
    [...heldValuesByInstrument(positions, marketValues)].map(
      ([instrumentId, held]) => ({
        instrumentId,
        value: held.value.toFixed(2),
        ter: instrumentsById.get(instrumentId)?.ter ?? null,
      }),
    ),
  );

  return {
    summary,
    returns,
    ter:
      ter.coveredValue === "0"
        ? null
        : { weightedTer: ter.weightedTer, annualCost: ter.annualCost },
    opportunity: opportunity.ok
      ? {
          difference: opportunity.result.difference,
          symbol: opportunity.symbol,
        }
      : null,
    allocation,
    top,
    range,
    real: {
      basis: real.basis,
      active: real.active,
      reference: real.reference,
      missing: real.missing,
      hasIndex: real.hasIndex,
      syncedAt: real.syncedAt,
    },
    change: computeHeroChange(range, series, summary),
    series: series.map((point) => ({
      t: point.t,
      invested: Number(point.invested),
      value: Number(point.value),
    })),
  };
}

export default function Summary({ loaderData }: Route.ComponentProps) {
  const {
    summary,
    returns,
    opportunity,
    ter,
    allocation,
    top,
    range,
    change,
    series,
    real,
  } = loaderData;
  const hasPositions = summary.pricedCount > 0 || summary.unpricedCount > 0;

  if (!hasPositions) {
    return (
      <>
        <Card>
          <PortfolioEmpty />
        </Card>
      </>
    );
  }

  return (
    <>
      <BasisNotice {...real} />

      <SummaryHero
        totalValue={summary.totalValue}
        changeAbs={change.abs}
        changePct={change.pct}
        range={range}
        unpricedCount={summary.unpricedCount}
        hasPositions={summary.pricedCount > 0}
      />

      <PortfolioValueChart data={series} />

      <SummaryStats
        totalInvested={summary.totalInvested}
        unrealizedPnL={summary.unrealizedPnL}
        realizedPnL={summary.realizedPnL}
        positionCount={summary.pricedCount}
        opportunity={opportunity}
        ter={ter}
      />

      <SummaryReturns
        twr={returns.twr}
        mwr={returns.mwr}
        realBasis={real.active}
      />

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}
      >
        <AllocationCard rows={allocation} />
        <TopPositionsCard rows={top} />
      </div>
    </>
  );
}

export function ErrorBoundary() {
  return (
    <>
      <Card>
        <PortfolioError onRetry={() => window.location.reload()} />
      </Card>
    </>
  );
}
