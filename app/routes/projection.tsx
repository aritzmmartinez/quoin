import type { Route } from "./+types/projection";

import { Card, PortfolioError, ProjectionPanel } from "~/components";
import {
  computeProjection,
  projectionWindow,
  solveContribution,
  solveHorizon,
} from "~/core/projections";
import {
  es,
  MIN_WINDOW_MONTHS,
  parseContribution,
  parseExtended,
  parseGoal,
  parseHorizonYears,
  type NamedValue,
  type ProjectionView,
} from "~/lib";
import { loadProjectionContext } from "~/lib/projection.server";

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
  const extended = parseExtended(params);

  const { annualInflation, plan } = await loadProjectionContext();

  const empty = {
    horizonYears,
    goal,
    extended,
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

  if (plan === null) {
    return {
      ...empty,
      contribution: parseContribution(params) ?? "0.00",
      problem: "no-target" as const,
    } satisfies ProjectionView;
  }

  const { source, input, nameOf } = plan;
  const contribution = parseContribution(params) ?? plan.defaultContribution;

  const shared = {
    ...empty,
    contribution,
    excluded: source.excluded,
    coverage: source.coverage,
    unpricedCount: plan.unpricedCount,
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

  const result = computeProjection({
    ...input,
    horizonMonths,
    monthlyContribution: contribution,
  });

  const unsimulated: NamedValue[] = result.unsimulatedInstrumentIds.map(
    (id) => ({
      instrumentId: id,
      name: nameOf(id),
      value: plan.offPlanValues.get(id) ?? "0",
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
