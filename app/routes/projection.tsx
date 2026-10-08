import { TrendingUp } from "lucide-react";
import { data } from "react-router";

import type { Route } from "./+types/projection";

import { Card, ProjectionPanel, SetupChecklist } from "~/components";
import {
  computeProjection,
  projectionWindow,
  solveContribution,
  solveHorizon,
} from "~/core/projections";
import {
  type Copy,
  copyFromMatches,
  MIN_WINDOW_MONTHS,
  type NamedValue,
  parseContribution,
  parseExtended,
  parseGoal,
  parseHorizonYears,
  type ProjectionView,
  setupPending,
  targetStep,
  tradesStep,
  useCopy,
} from "~/lib";
import {
  loadProjectionContext,
  type ProjectionContext,
} from "~/lib/projection.server";
import { createServerTiming, type ServerTiming } from "~/lib/server-timing";

export function meta({ matches }: Route.MetaArgs) {
  const t = copyFromMatches(matches);
  return [
    { title: t.meta.projection.title },
    { name: "description", content: t.meta.projection.description },
  ];
}

export const handle = { title: (t: Copy) => t.projection.title };

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export async function loader({ request }: Route.LoaderArgs) {
  const timing = createServerTiming();
  const context = await loadProjectionContext(new Date(), timing);
  const view = projectionView(
    new URL(request.url).searchParams,
    context,
    timing,
  );
  const setup = [
    tradesStep(context.hasTrades),
    targetStep(context.plan !== null),
  ];
  return data({ view, setup }, { headers: timing.headers() });
}

function projectionView(
  params: URLSearchParams,
  { annualInflation, plan }: ProjectionContext,
  timing: ServerTiming,
) {
  const horizonYears = parseHorizonYears(params);
  const horizonMonths = horizonYears * 12;
  const goal = parseGoal(params);
  const extended = parseExtended(params);

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

  const result = timing.time("simulate", () =>
    computeProjection({
      ...input,
      horizonMonths,
      monthlyContribution: contribution,
    }),
  );

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
            monthlyContribution: timing.time("goal-contribution", () =>
              solveContribution({ ...input, horizonMonths }, goal),
            ),
            horizonMonths: timing.time("goal-horizon", () =>
              solveHorizon(
                { ...input, monthlyContribution: contribution },
                goal,
              ),
            ),
          },
  } satisfies ProjectionView;
}

export default function Projection({ loaderData }: Route.ComponentProps) {
  const t = useCopy();
  const { view, setup } = loaderData;

  if (setupPending(setup)) {
    return (
      <Card>
        <SetupChecklist
          icon={TrendingUp}
          title={t.setup.screens.projection.title}
          body={t.setup.screens.projection.body}
          steps={setup}
        />
      </Card>
    );
  }

  return <ProjectionPanel view={view} />;
}

export { ErrorBoundary } from "~/components/ui/ErrorBoundary";
