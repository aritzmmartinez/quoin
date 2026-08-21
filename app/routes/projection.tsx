import Decimal from "decimal.js";

import type { Route } from "./+types/projection";

import {
  PrismaInflationRepository,
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
  PrismaTargetRepository,
} from "~/adapters/persistence";
import { Card, PortfolioError, ProjectionPanel } from "~/components";
import {
  averageMonthlyInflation,
  BASE_CURRENCY,
  getActiveTarget,
  monthlyTotal,
} from "~/core/domain";
import {
  computeMarketValues,
  computePortfolioSummary,
  computePositions,
  computeProjection,
  projectionWindow,
  solveContribution,
  solveHorizon,
} from "~/core/projections";
import {
  buildProjectionSource,
  es,
  heldValuesByInstrument,
  MIN_WINDOW_MONTHS,
  parseContribution,
  parseGoal,
  parseHorizonYears,
  type NamedValue,
  type ProjectionView,
} from "~/lib";
import { DEFAULT_INFLATION_SERIES } from "~/lib/real.server";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Proyección · Quoin" },
    { name: "description", content: "Hacia dónde puede ir tu plan" },
  ];
}

export const handle = { title: es.projection.title };

export async function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  const horizonYears = parseHorizonYears(params);
  const horizonMonths = horizonYears * 12;
  const goal = parseGoal(params);

  const priceRepository = new PrismaPriceRepository();
  const [events, instruments, prices, targets, inflationPoints] =
    await Promise.all([
      new PrismaLedgerRepository().list(),
      new PrismaInstrumentRepository().list(),
      priceRepository.latest(),
      new PrismaTargetRepository().list(),
      new PrismaInflationRepository().list(DEFAULT_INFLATION_SERIES),
    ]);

  const target = getActiveTarget(targets, new Date());
  const monthlyInflation = averageMonthlyInflation(inflationPoints);
  const annualInflation =
    monthlyInflation === null
      ? null
      : new Decimal(monthlyInflation).plus(1).pow(12).minus(1).toFixed(6);

  const empty = {
    horizonYears,
    goal,
    result: null,
    windowMonths: 0,
    limitingName: "",
    excluded: [],
    coverage: "0",
    unsimulated: [],
    unpricedCount: 0,
    annualInflation,
    goalAnswer: null,
  };

  if (target === null) {
    return {
      ...empty,
      contribution: parseContribution(params) ?? "0.00",
      problem: "no-target" as const,
    } satisfies ProjectionView;
  }

  const contribution = parseContribution(params) ?? monthlyTotal(target);

  const positions = computePositions(events);
  const marketValues = computeMarketValues(positions, prices, BASE_CURRENCY);
  const summary = computePortfolioSummary(positions, marketValues);
  const held = heldValuesByInstrument(positions, marketValues);

  const instrumentsById = new Map(
    instruments.map((instrument) => [instrument.id, instrument]),
  );
  const nameOf = (id: string): string => instrumentsById.get(id)?.name ?? id;

  const plannedIds = new Set(target.lines.map((line) => line.instrumentId));

  let plannedValue = new Decimal(0);
  const offPlanValues = new Map<string, string>();
  for (const [instrumentId, entry] of held) {
    if (plannedIds.has(instrumentId))
      plannedValue = plannedValue.plus(entry.value);
    else if (entry.value.gt(0)) {
      offPlanValues.set(instrumentId, entry.value.toFixed(2));
    }
  }

  const historyIds = [...new Set([...plannedIds, ...offPlanValues.keys()])];
  const histories = await Promise.all(
    historyIds.map((id) => priceRepository.historyFor(id)),
  );

  const now = new Date();
  const source = buildProjectionSource(
    target,
    new Map(
      historyIds.map((id, index) => [
        id,
        (histories[index] ?? [])
          .filter((snapshot) => snapshot.currency === BASE_CURRENCY)
          .map((snapshot) => ({ asOf: snapshot.asOf, price: snapshot.price })),
      ]),
    ),
    instrumentsById,
    offPlanValues,
    now,
  );

  const shared = {
    ...empty,
    contribution,
    excluded: source.excluded,
    coverage: source.coverage,
    unpricedCount: summary.unpricedCount,
  };

  if (source.lines.length === 0) {
    return {
      ...shared,
      problem: "no-history" as const,
    } satisfies ProjectionView;
  }

  const window = projectionWindow(source.lines);
  const located = {
    ...shared,
    windowMonths: window.windowMonths,
    limitingName: nameOf(window.limitingInstrumentId),
  };

  if (window.windowMonths === 0) {
    return {
      ...located,
      problem: "no-window" as const,
    } satisfies ProjectionView;
  }
  if (window.windowMonths < MIN_WINDOW_MONTHS) {
    return {
      ...located,
      problem: "thin-window" as const,
    } satisfies ProjectionView;
  }

  const input = {
    lines: source.lines,
    heldLines: source.heldLines,
    plannedValue: plannedValue.toFixed(2),
    monthlyInflation,
  };

  const result = computeProjection({
    ...input,
    horizonMonths,
    monthlyContribution: contribution,
  });

  const unsimulated: NamedValue[] = result.unsimulatedInstrumentIds.map(
    (id) => ({
      instrumentId: id,
      name: nameOf(id),
      value: offPlanValues.get(id) ?? "0",
    }),
  );

  return {
    ...located,
    problem: null,
    result,
    unsimulated,
    goalAnswer:
      goal === null
        ? null
        : {
            amount: goal,
            monthlyContribution: solveContribution(
              { ...input, horizonMonths },
              goal,
            ),
            horizonMonths: solveHorizon(
              { ...input, monthlyContribution: contribution },
              goal,
            ),
          },
  } satisfies ProjectionView;
}

export default function Projection({ loaderData }: Route.ComponentProps) {
  return <ProjectionPanel view={loaderData} />;
}

export function ErrorBoundary() {
  return (
    <Card>
      <PortfolioError onRetry={() => window.location.reload()} />
    </Card>
  );
}
