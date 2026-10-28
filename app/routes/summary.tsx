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
  Explainer,
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
  computeTotalContributed,
  computeWeightedTer,
  unpricedOpenIds,
  withoutInstruments,
} from "~/core/projections";
import {
  computeHeroChange,
  type Copy,
  copyFor,
  copyFromMatches,
  exposureKindLabel,
  filterByRange,
  heldValuesByInstrument,
  intlTag,
  namesOf,
  parseBenchmark,
  parseLocale,
  parseRange,
  pricesStep,
  tradesStep,
  useCopy,
} from "~/lib";

import { UnratedNotice } from "~/components/ui/UnratedNotice";
import { BASE_CURRENCY, type Revalue } from "~/core/domain";
import { historyInBase, unconvertibleInstrumentIds } from "~/core/fx";
import { firstEventByInstrument } from "~/lib/history-start";
import { loadOpportunityCost } from "~/lib/opportunity-cost.server";
import { loadValuation } from "~/lib/rate-book.server";
import { openInstrumentIds, unratedNames } from "~/lib/unrated";
import { resolveRealView } from "~/lib/real.server";
import { loadResidence } from "~/lib/residence.server";
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
  const locale = parseLocale(request.headers.get("Cookie"));
  const t = copyFor(locale);
  const priceRepository = new PrismaPriceRepository();
  const timing = createServerTiming();

  const { jurisdiction } = await timing.time("db-settings", () =>
    loadResidence(),
  );
  const { zone } = jurisdiction;
  const events = await timing.time("db-ledger", () =>
    new PrismaLedgerRepository().list(),
  );
  const instruments = await timing.time("db-instruments", () =>
    new PrismaInstrumentRepository().list(),
  );
  const now = new Date();
  const valuation = await timing.time("db-prices-latest", () =>
    loadValuation(zone, now),
  );
  const { prices } = valuation;

  const real = await timing.time("real-view", () =>
    resolveRealView(request, events, zone),
  );
  const positions = timing.time("positions", () =>
    computePositions(events, jurisdiction, real.revalue),
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

  const unpriced = unpricedOpenIds(positions, marketValues);
  const included = withoutInstruments(events, unpriced);
  const heldIds = [...new Set(positions.map((p) => p.instrumentId))].filter(
    (id) => !unpriced.has(id),
  );
  const firstEvents = firstEventByInstrument(events);
  const histories = await timing.time("db-history", () =>
    Promise.all(
      heldIds.map((id) => priceRepository.historyFor(id, firstEvents.get(id))),
    ),
  );

  const marks = histories.map((history) =>
    historyInBase(history, valuation.book, zone).history.map((snapshot) => ({
      asOf: snapshot.asOf,
      price: snapshot.price,
    })),
  );
  const buildSeries = (revalue?: Revalue) =>
    computePortfolioInvestedVsValueSeries(
      heldIds.map((id, index) =>
        computeInvestedVsValueSeries(
          included,
          id,
          marks[index] ?? [],
          prices.get(id)?.price ?? null,
          now,
          jurisdiction,
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
    computePortfolioReturns(included, nominalSeries),
  );

  const opportunity = await timing.time("opportunity", () =>
    loadOpportunityCost(
      events,
      instruments,
      valuation,
      parseBenchmark(request.headers.get("Cookie")),
      zone,
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
      totalContributed: computeTotalContributed(events, real.revalue),
      returns: returns.period,
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
      noRate: namesOf(unconvertibleInstrumentIds(events), instruments),
      unrated: unratedNames(
        valuation.unrated,
        instruments,
        openInstrumentIds(positions),
        intlTag(locale),
      ),
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
    totalContributed,
    returns,
    opportunity,
    ter,
    allocation,
    top,
    range,
    change,
    series,
    real,
    noRate,
    unrated,
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

      {noRate.length > 0 && (
        <Explainer tone="notice">{t.common.noRateExcluded(noRate)}</Explainer>
      )}
      <UnratedNotice unrated={unrated} />

      <SummaryHero
        totalValue={summary.totalValue}
        changeAbs={change.abs}
        changePct={change.pct}
        range={range}
        unpricedCount={summary.unpricedCount}
        unpricedCost={summary.unpricedCost}
        hasPositions={summary.pricedCount > 0}
      />

      <PortfolioValueChart
        data={series}
        unpricedCount={summary.unpricedCount}
      />

      <SummaryStats
        openCost={summary.openCost}
        totalContributed={totalContributed}
        unpricedCount={summary.unpricedCount}
        unpricedCost={summary.unpricedCost}
        unrealizedPnL={summary.unrealizedPnL}
        realizedPnL={summary.realizedPnL}
        positionCount={summary.pricedCount}
        opportunity={opportunity}
        ter={ter}
        realReference={real.active ? real.reference : null}
      />

      <SummaryReturns
        period={returns}
        pricedCount={summary.pricedCount}
        openCount={summary.pricedCount + summary.unpricedCount}
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
