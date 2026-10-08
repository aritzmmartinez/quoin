import { LayoutDashboard } from "lucide-react";
import { data } from "react-router";

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
  SetupChecklist,
  SummaryHero,
  SummaryReturns,
  SummaryStats,
  TopPositionsCard,
  type AllocationRow,
  type TopPositionRow,
} from "~/components";
import { PortfolioValueChart } from "~/components/summary/PortfolioValueChart";
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
  type Copy,
  copyFor,
  copyFromMatches,
  exposureKindLabel,
  filterByRange,
  heldValuesByInstrument,
  parseBenchmark,
  parseLocale,
  parseRange,
  pricesStep,
  tradesStep,
  useCopy,
} from "~/lib";

import { BASE_CURRENCY, type Revalue } from "~/core/domain";
import { firstEventByInstrument } from "~/lib/history-start";
import { loadOpportunityCost } from "~/lib/opportunity-cost.server";
import { resolveRealView } from "~/lib/real.server";
import { createServerTiming } from "~/lib/server-timing";

const TOP_POSITIONS = 5;

export function meta({ matches }: Route.MetaArgs) {
  const t = copyFromMatches(matches);
  return [
    { title: t.meta.summary.title },
    { name: "description", content: t.meta.summary.description },
  ];
}

export const handle = {
  title: (t: Copy) => t.summary.title,
  range: true,
  basis: true,
};

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export async function loader({ request }: Route.LoaderArgs) {
  const range = parseRange(new URL(request.url).searchParams);
  const t = copyFor(parseLocale(request.headers.get("Cookie")));
  const priceRepository = new PrismaPriceRepository();
  const timing = createServerTiming();

  const events = await timing.time("db-ledger", () =>
    new PrismaLedgerRepository().list(),
  );
  const instruments = await timing.time("db-instruments", () =>
    new PrismaInstrumentRepository().list(),
  );
  const prices = await timing.time("db-prices-latest", () =>
    priceRepository.latest(),
  );

  const real = await timing.time("real-view", () =>
    resolveRealView(request, events),
  );
  const positions = timing.time("positions", () =>
    computePositions(events, real.revalue),
  );
  const marketValues = timing.time("valuation", () =>
    computeMarketValues(positions, prices, BASE_CURRENCY),
  );
  const summary = computePortfolioSummary(positions, marketValues);

  const instrumentsById = new Map(instruments.map((i) => [i.id, i]));
  const categories = new Map(
    instruments.flatMap((i) =>
      i.exposureKind ? [[i.id, i.exposureKind] as const] : [],
    ),
  );

  const allocation: AllocationRow[] = computeAllocation(
    positions,
    marketValues,
    categories,
  ).map((slice) => ({
    ...slice,
    label: exposureKindLabel(t, slice.category),
  }));

  const top: TopPositionRow[] = computeTopPositions(
    positions,
    marketValues,
    TOP_POSITIONS,
  ).map((row) => ({
    instrumentId: row.instrumentId,
    name: instrumentsById.get(row.instrumentId)?.name ?? row.instrumentId,
    thesis: instrumentsById.get(row.instrumentId)?.thesis ?? "CORE",
    marketValue: row.marketValue,
    weight: row.weight,
    unrealizedPnLPct: row.unrealizedPnLPct,
  }));

  const heldIds = [...new Set(positions.map((p) => p.instrumentId))];
  const firstEvents = firstEventByInstrument(events);
  const histories = await timing.time("db-history", () =>
    Promise.all(
      heldIds.map((id) => priceRepository.historyFor(id, firstEvents.get(id))),
    ),
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

  const portfolioSeries = timing.time("series", () =>
    buildSeries(real.revalue),
  );
  const series = filterByRange(portfolioSeries, range, now);

  const nominalSeries = real.revalue
    ? timing.time("series-nominal", () => buildSeries())
    : portfolioSeries;
  const returns = timing.time("returns", () =>
    computePortfolioReturns(events, nominalSeries),
  );

  const opportunity = await timing.time("opportunity", () =>
    loadOpportunityCost(
      events,
      instruments,
      prices,
      parseBenchmark(request.headers.get("Cookie")),
      now,
    ),
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

  return data(
    {
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
        checkStale: real.checkStale,
      },
      change: computeHeroChange(range, series, summary),
      series: series.map((point) => ({
        t: point.t,
        invested: Number(point.invested),
        value: Number(point.value),
      })),
    },
    { headers: timing.headers() },
  );
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
  const t = useCopy();
  const hasPositions = summary.pricedCount > 0 || summary.unpricedCount > 0;

  if (!hasPositions) {
    return (
      <Card>
        <PortfolioEmpty />
      </Card>
    );
  }

  if (summary.pricedCount === 0) {
    return (
      <Card>
        <SetupChecklist
          icon={LayoutDashboard}
          title={t.setup.screens.summary.title}
          body={t.setup.screens.summary.body}
          steps={[tradesStep(true), pricesStep(false)]}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
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
        className="grid items-stretch gap-3"
        style={{
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
        }}
      >
        <AllocationCard rows={allocation} />
        <TopPositionsCard rows={top} />
      </div>
    </div>
  );
}

export { ErrorBoundary } from "~/components/ui/ErrorBoundary";
