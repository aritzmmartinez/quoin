import Decimal from "decimal.js";
import { Form, useSearchParams } from "react-router";

import {
  carriedParams,
  CONTRIBUTION_PARAM,
  es,
  formatMoney,
  formatPercent,
  GOAL_PARAM,
  HORIZON_PARAM,
  MAX_HORIZON_YEARS,
  MIN_WINDOW_MONTHS,
  offPlanState,
  type ProjectionView,
} from "~/lib";
import type { ProjectionResult } from "~/core/projections";

import { Card } from "../ui/Card";
import { Hint } from "../ui/Hint";

const FIELD =
  "rounded-md border border-border bg-surface px-2 py-1.5 text-[13px] tabular-nums";

const OWNED: readonly string[] = [
  HORIZON_PARAM,
  CONTRIBUTION_PARAM,
  GOAL_PARAM,
];

export function ProjectionPanel({ view }: { view: ProjectionView }) {
  const copy = es.projection;
  const [params] = useSearchParams();

  return (
    <div className="flex flex-col gap-4">
      <Card className="min-w-0 p-6">
        <h2 className="mb-1 text-[14px] font-semibold">{copy.title}</h2>
        <p className="mb-4 text-[12.5px] leading-[1.6] text-muted">
          {copy.intro}
        </p>

        {view.problem === "no-target" ? (
          <p className="text-[13px] text-muted">{copy.noTarget}</p>
        ) : (
          <>
            <Form method="get" className="mb-5 flex flex-wrap items-end gap-3">
              {carriedParams(params, OWNED).map(([key, value], index) => (
                <input key={index} type="hidden" name={key} value={value} />
              ))}
              <label className="grid gap-1 text-[12px] text-muted">
                {copy.form.horizon}
                <input
                  name={HORIZON_PARAM}
                  type="number"
                  min="1"
                  max={MAX_HORIZON_YEARS}
                  step="1"
                  autoComplete="off"
                  defaultValue={view.horizonYears}
                  className={`${FIELD} w-24`}
                />
              </label>
              <label className="grid gap-1 text-[12px] text-muted">
                {copy.form.contribution}
                <input
                  name={CONTRIBUTION_PARAM}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  defaultValue={view.contribution}
                  className={`${FIELD} w-40`}
                />
              </label>
              <label className="grid gap-1 text-[12px] text-muted">
                {copy.form.goal}
                <input
                  name={GOAL_PARAM}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  defaultValue={view.goal ?? ""}
                  placeholder={copy.form.goalPlaceholder}
                  className={`${FIELD} w-44`}
                />
              </label>
              <button
                type="submit"
                className="rounded-md border border-border px-3 py-1.5 text-[12px] transition-colors hover:bg-surface-2"
              >
                {copy.form.submit}
              </button>
            </Form>

            {view.problem === "thin-window" ? (
              <ThinWindow view={view} />
            ) : view.problem !== null || view.result === null ? (
              <p className="text-[13px] text-negative">
                {view.problem === "no-history" ? copy.noHistory : copy.noWindow}
              </p>
            ) : (
              <Bands view={view} />
            )}

            <Notes view={view} />
          </>
        )}
      </Card>

      {view.result !== null && view.goalAnswer !== null && (
        <GoalCard view={view} />
      )}

      {view.result !== null && <Method view={view} />}
    </div>
  );
}

function ThinWindow({ view }: { view: ProjectionView }) {
  const copy = es.projection.thinWindow;

  return (
    <div className="rounded-md border border-border bg-surface-2 px-4 py-3.5">
      <h3 className="text-[13px] font-semibold">{copy.title}</h3>
      <div className="mt-2 flex flex-col gap-2 text-[12.5px] leading-[1.6] text-muted">
        <p>
          {copy.body(view.windowMonths, MIN_WINDOW_MONTHS, view.limitingName)}
        </p>
        <p>{copy.why(view.windowMonths, view.horizonYears)}</p>
        <p>{copy.fix(view.limitingName)}</p>
      </div>
    </div>
  );
}

function Bands({ view }: { view: ProjectionView }) {
  const copy = es.projection;
  const result = view.result;
  if (result === null) return null;

  const bands = [
    {
      label: copy.bands.p10,
      hint: copy.bands.p10Hint,
      value: result.p10,
      real: result.p10Real,
      strong: false,
    },
    {
      label: copy.bands.p50,
      hint: copy.bands.p50Hint,
      value: result.p50,
      real: result.p50Real,
      strong: true,
    },
    {
      label: copy.bands.p90,
      hint: copy.bands.p90Hint,
      value: result.p90,
      real: result.p90Real,
      strong: false,
    },
  ];

  return (
    <div>
      <div className="mb-3 text-[11px] uppercase tracking-[0.08em] text-muted">
        {copy.bands.title(view.horizonYears)}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {bands.map((band) => (
          <div
            key={band.label}
            className="rounded-md border border-border px-4 py-3.5"
          >
            <Hint
              label={band.hint}
              className="text-[11px] text-muted underline decoration-dotted underline-offset-2"
            >
              {band.label}
            </Hint>
            <div
              className={`mt-1 tabular-nums tracking-tight ${
                band.strong
                  ? "text-[22px] font-semibold"
                  : "text-[18px] font-medium text-muted"
              }`}
            >
              {formatMoney(band.value)}
            </div>
            <div className="mt-0.5 text-[11px] text-muted">
              {band.real === null
                ? copy.bands.noReal
                : copy.bands.real(formatMoney(band.real))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[12px] leading-[1.6] text-muted">
        {copy.contributed(formatMoney(result.contributed))}
      </p>
    </div>
  );
}

function Notes({ view }: { view: ProjectionView }) {
  const copy = es.projection;
  const unsimulatedTotal = view.unsimulated.reduce(
    (sum, row) => sum.plus(new Decimal(row.value)),
    new Decimal(0),
  );

  return (
    <div className="mt-4 flex flex-col gap-2 text-[12px] leading-[1.6]">
      {view.excluded.length > 0 && (
        <p className="text-negative">
          {copy.excluded(
            view.excluded.map((line) => line.name).join(", "),
            formatPercent(view.coverage, 1),
          )}
        </p>
      )}
      {view.unsimulated.length > 0 && (
        <p className="text-muted">
          {copy.unsimulated(
            view.unsimulated.map((row) => row.name).join(", "),
            formatMoney(unsimulatedTotal.toFixed(2)),
          )}
        </p>
      )}
      {view.unpricedCount > 0 && (
        <p className="text-negative">{copy.unpriced(view.unpricedCount)}</p>
      )}
      <p className="text-muted">{copy.hypothesis}</p>
    </div>
  );
}

function GoalCard({ view }: { view: ProjectionView }) {
  const copy = es.projection.goal;
  const answer = view.goalAnswer;
  if (answer === null) return null;

  return (
    <Card className="min-w-0 p-6">
      <h2 className="mb-3 text-[14px] font-semibold">
        {copy.title(formatMoney(answer.amount))}
      </h2>

      <ul className="flex flex-col gap-2 text-[13px] leading-[1.6]">
        <li>
          {answer.monthlyContribution === null
            ? copy.contributionUnreachable
            : copy.contribution(
                formatMoney(answer.monthlyContribution),
                view.horizonYears,
              )}
        </li>
        <li>
          {answer.horizonMonths === null
            ? copy.horizonUnreachable
            : answer.horizonMonths === 0
              ? copy.horizonNow
              : copy.horizon(
                  formatMoney(view.contribution),
                  es.projection.horizonLabel(answer.horizonMonths),
                )}
        </li>
      </ul>

      <p className="mt-3 text-[12px] leading-[1.6] text-muted">{copy.caveat}</p>
    </Card>
  );
}

function offPlanNote(result: ProjectionResult): string {
  const copy = es.projection.method;
  switch (offPlanState(result)) {
    case "simulated":
      return copy.twoPots(formatMoney(result.offPlanValue));
    case "all-excluded":
      return copy.allOffPlanExcluded;
    case "none":
      return copy.noOffPlan;
  }
}

function Method({ view }: { view: ProjectionView }) {
  const copy = es.projection.method;
  const result = view.result;
  if (result === null) return null;

  return (
    <Card className="min-w-0 p-6">
      <h2 className="mb-3 text-[11px] uppercase tracking-[0.08em] text-muted">
        {copy.title}
      </h2>

      <ul className="flex flex-col gap-2 text-[12px] leading-[1.6] text-muted">
        <li>{copy.window(result.windowMonths, view.limitingName)}</li>
        <li>
          {copy.drift(
            formatPercent(result.impliedAnnualReturn, 2),
            view.horizonYears,
          )}
        </li>
        <li>{copy.simulations(result.simulations, result.seed)}</li>
        {view.annualInflation !== null && (
          <li>{copy.inflation(formatPercent(view.annualInflation, 2))}</li>
        )}
        <li>{copy.fixedWeights}</li>
        <li>{offPlanNote(result)}</li>
      </ul>
    </Card>
  );
}
