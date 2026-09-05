import Decimal from "decimal.js";
import { ChevronDown, Info } from "lucide-react";
import { Form, useSearchParams } from "react-router";

import {
  carriedParams,
  CONTRIBUTION_PARAM,
  DRIFT_THRESHOLD_PARAM,
  es,
  formatMoney,
  formatPercent,
  type RebalancePlan,
  type RebalanceRow,
} from "~/lib";

import { Card } from "../ui/Card";
import { Hint } from "../ui/Hint";
import { MeterBar } from "../ui/MeterBar";
import { Button } from "../ui/Button";

const GRID =
  "grid-cols-[minmax(0,1fr)_110px_105px] gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(90px,140px)_110px_105px]";

const FIELD =
  "rounded-md border border-border bg-surface px-2 py-1.5 text-[13px] tabular-nums";

export function RebalancePanel({
  plan,
  hasTarget,
  driftThreshold,
}: {
  plan: RebalancePlan | null;
  hasTarget: boolean;
  driftThreshold: string;
}) {
  const copy = es.rebalance;
  const [params] = useSearchParams();
  const driftPercent = new Decimal(driftThreshold).times(100).toString();

  return (
    <Card className="min-w-0 p-6">
      <h2 className="mb-1 text-[14px] font-semibold">{copy.title}</h2>
      <p className="mb-4 text-[12.5px] leading-[1.6] text-muted">
        {copy.intro}
      </p>

      {!hasTarget ? (
        <p className="text-[13px] text-muted">{copy.noTarget}</p>
      ) : (
        <>
          <Form method="get" className="mb-5 flex flex-wrap items-end gap-3">
            {carriedParams(params).map(([key, value], index) => (
              <input key={index} type="hidden" name={key} value={value} />
            ))}
            <label className="grid gap-1 text-[12px] text-muted">
              {copy.amount}
              <input
                name={CONTRIBUTION_PARAM}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                defaultValue={plan?.contribution ?? ""}
                placeholder={copy.amountPlaceholder}
                className={`${FIELD} w-40`}
              />
            </label>
            <label className="grid gap-1 text-[12px] text-muted">
              {copy.threshold}
              <input
                name={DRIFT_THRESHOLD_PARAM}
                type="number"
                min="0"
                max="50"
                step="0.5"
                autoComplete="off"
                defaultValue={driftPercent}
                className={`${FIELD} w-24`}
              />
            </label>
            <Button type="submit">{copy.submit}</Button>
          </Form>

          {plan === null ? (
            <p className="text-[13px] text-muted">{copy.prompt}</p>
          ) : plan.rows.length === 0 ? (
            <p className="text-[13px] text-muted">{copy.empty}</p>
          ) : (
            <>
              <Split plan={plan} />
              <Notes plan={plan} driftThreshold={driftThreshold} />
              <OffPlan plan={plan} />
            </>
          )}
        </>
      )}
    </Card>
  );
}

function Split({ plan }: { plan: RebalancePlan }) {
  const copy = es.rebalance;
  const peak = plan.rows.reduce((max, r) => Math.max(max, Number(r.share)), 0);

  return (
    <div>
      <div
        className={`grid ${GRID} border-b border-border py-2 text-[11px] font-medium tracking-wide text-muted`}
      >
        <span>{copy.columns.instrument}</span>
        <span className="text-right">{copy.columns.amount}</span>
        <span className="hidden text-right sm:block">
          {copy.columns.current}
        </span>
        <Hint
          label={copy.driftHint}
          className="justify-self-end underline decoration-dotted underline-offset-2"
        >
          {copy.columns.drift}
        </Hint>
      </div>

      <ul>
        {plan.rows.map((row) => (
          <Row key={row.instrumentId} row={row} peak={peak} />
        ))}
      </ul>

      <div
        className={`grid ${GRID} items-baseline border-t border-border py-row text-[13px]`}
      >
        <span className="text-muted">{copy.total}</span>
        <span className="text-right font-medium tabular-nums">
          {formatMoney(plan.contribution)}
        </span>
        <span className="hidden sm:block" />
        <span className="text-right tabular-nums text-muted">
          {copy.driftArrow(
            formatPercent(plan.totalDriftBefore, 1),
            formatPercent(plan.totalDriftAfter, 1),
          )}
        </span>
      </div>
    </div>
  );
}

function Row({ row, peak }: { row: RebalanceRow; peak: number }) {
  const copy = es.rebalance;
  const funded = Number(row.amount) > 0;
  const worsens = Number(row.driftAfter) > Number(row.driftBefore);

  return (
    <li
      className={`grid ${GRID} items-baseline border-b border-border py-row text-[13px] last:border-b-0`}
    >
      <div className="min-w-0">
        <div className="truncate">{row.name}</div>
        <div className="truncate font-mono text-[10.5px] text-muted">
          {row.instrumentId}
        </div>
      </div>

      <div>
        <div
          className={`text-right tabular-nums ${funded ? "font-medium" : "text-muted"}`}
        >
          {formatMoney(row.amount)}
        </div>
        <MeterBar
          className="mt-1 h-1"
          segments={[
            {
              width: peak === 0 ? 0 : (Number(row.share) / peak) * 100,
              color: "var(--color-text)",
            },
          ]}
          label={formatPercent(row.share, 1)}
        />
      </div>

      <div className="hidden text-right sm:block">
        <div className="tabular-nums text-muted">
          {formatMoney(row.currentValue)}
        </div>
        <div className="text-[10.5px] tabular-nums text-muted">
          {copy.targetSuffix(formatPercent(row.targetWeight))}
        </div>
      </div>

      <div className="flex items-baseline justify-end gap-1 text-right tabular-nums text-muted">
        <span>
          {copy.driftArrow(
            formatPercent(row.driftBefore, 1),
            formatPercent(row.driftAfter, 1),
          )}
        </span>
        {worsens && (
          <Hint
            label={copy.worseningHint}
            name={copy.worsening}
            className="shrink-0 self-center"
          >
            <Info size={11} strokeWidth={1.75} aria-hidden />
          </Hint>
        )}
      </div>
    </li>
  );
}

function Notes({
  plan,
  driftThreshold,
}: {
  plan: RebalancePlan;
  driftThreshold: string;
}) {
  const copy = es.rebalance;

  return (
    <div className="mt-4 flex flex-col gap-2 text-[12px] leading-[1.6]">
      <p className={plan.isOverThreshold ? "text-negative" : "text-muted"}>
        {(plan.isOverThreshold ? copy.overThreshold : copy.underThreshold)(
          formatPercent(plan.totalDriftBefore, 1),
          formatPercent(driftThreshold, 1),
        )}
      </p>

      {plan.unpriced.length > 0 && (
        <p className="text-negative">
          {copy.unpriced(plan.unpriced.join(", "))}
        </p>
      )}

      <p className="text-muted">{copy.hypothesis}</p>
    </div>
  );
}

function OffPlan({ plan }: { plan: RebalancePlan }) {
  const copy = es.rebalance;
  if (plan.offPlan.length === 0) return null;

  return (
    <details className="group mt-5 border-t border-border pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-muted marker:content-[''] [&::-webkit-details-marker]:hidden">
        <ChevronDown
          size={12}
          strokeWidth={1.75}
          aria-hidden
          className="shrink-0 transition-transform group-open:rotate-0 -rotate-90"
        />
        {copy.offPlan(plan.offPlan.length)}
      </summary>

      <ul className="mt-2">
        {plan.offPlan.map((row) => (
          <li
            key={row.instrumentId}
            className="flex justify-between gap-3 border-b border-border py-1.5 text-[13px] last:border-b-0"
          >
            <span className="min-w-0 truncate">{row.name}</span>
            <span className="shrink-0 tabular-nums text-muted">
              {formatMoney(row.value)}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[12px] leading-[1.6] text-muted">
        {copy.offPlanNote}
      </p>
    </details>
  );
}
