import Decimal from "decimal.js";
import { useNavigate, useSearchParams } from "react-router";

import {
  DASH,
  taxYearHref,
  type TaxInKindIncome,
  type TaxSavingsIncome,
  type TaxYearView,
  useCopy,
  useFormat,
} from "~/lib";
import { territoryRules, type Territory } from "~/core/tax";

import { Card } from "../ui/Card";
import { InfoHint } from "../ui/Hint";
import { Select } from "../ui/Select";
import { SignedMoney } from "../SignedMoney";
import { PendingDeferralsCard } from "./PendingDeferralsCard";
import { TaxSaleItem } from "./TaxSaleItem";
import {
  TAX_DEFERRED_GRID,
  TAX_SALE_GRID,
  TAX_SALE_MIN_WIDTH,
} from "./tax-columns";

function TaxYearSelect({ years, year }: { years: number[]; year: number }) {
  const t = useCopy();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const copy = t.realized.fiscal;

  return (
    <Select
      label={copy.yearLabel}
      value={String(year)}
      options={years.map((y) => ({ value: String(y), label: String(y) }))}
      onChange={(value) => navigate(taxYearHref(params, Number(value)))}
    />
  );
}

export function TaxYearPanel({
  years,
  year,
  currentYear,
  territory,
  view,
}: {
  years: number[];
  year: number | null;
  currentYear: number;
  territory: Territory;
  view: TaxYearView | null;
}) {
  const { formatMoney } = useFormat();
  const t = useCopy();
  const copy = t.realized.fiscal;
  const { citations, lossCarryforwardYears, crossOffsetLimit } =
    territoryRules(territory);
  const crosses = !new Decimal(crossOffsetLimit).isZero();

  if (years.length === 0 || year === null) {
    return (
      <Card>
        <div className="px-6 py-16 text-center">
          <p className="text-[13px] text-muted">{copy.noYears}</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-[12px] text-muted">
          {copy.yearLabel}
        </span>
        <TaxYearSelect years={years} year={year} />
        <InfoHint
          size={18}
          name={copy.about}
          label={copy.intro[territory]}
        />
      </div>

      {view && (
        <>
          <Card className="p-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <SummaryFigure label={copy.summary.gainsBalance}>
                <SignedMoney value={view.netSavingsBase} />
              </SummaryFigure>
              <SummaryFigure label={copy.summary.incomeBalance}>
                <SignedMoney value={view.savingsIncome.finalNet} />
              </SummaryFigure>
              <SummaryFigure label={copy.summary.netBase}>
                {formatMoney(view.savingsBase)}
              </SummaryFigure>
              <SummaryFigure label={copy.summary.quota}>
                {view.quota === null ? DASH : formatMoney(view.quota)}
              </SummaryFigure>
              <SummaryFigure label={copy.summary.withheld}>
                {formatMoney(view.withholdings.total)}
              </SummaryFigure>
            </div>
            <p className="mt-4 text-[11.5px] text-muted">
              {copy.summary.pools[territory]}
            </p>
            <p className="mt-2 text-[11.5px] text-muted">
              {copy.summary.withheldNote}
            </p>
            {view.withholdings.interestWithoutWithholding && (
              <p className="mt-2 text-[11.5px] text-body">
                {copy.summary.interestWithoutWithholding}
              </p>
            )}
            <p className="mt-2 text-[11.5px] text-muted">
              {view.scale
                ? copy.summary.scale(view.scale.source)
                : copy.summary.noScale}
              {view.scaleYear !== null && view.scaleYear < view.year && (
                <>
                  {" "}
                  {copy.summary.scaleInForce(
                    view.scaleYear,
                    copy.territoryName[territory],
                  )}
                </>
              )}
            </p>
          </Card>

          <Card>
            <div className="border-b border-border px-gutter py-4">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-[14px] font-semibold">{copy.salesTitle}</h2>
                <span className="text-[11.5px] text-muted">
                  {copy.net.counts(view.sales.length, view.affectedCount)}
                </span>
              </div>
              <NetLine label={copy.net.own} value={view.ownNet} />
              {view.nonComputableSum !== "0.00" && (
                <NetLine
                  label={copy.net.nonComputable(citations.repurchase)}
                  value={negate(view.nonComputableSum)}
                />
              )}
              {view.integratedSum !== "0.00" && (
                <NetLine
                  label={copy.net.integrated}
                  value={view.integratedSum}
                />
              )}
              <NetLine
                label={copy.net.computable}
                value={view.computableNet}
                strong
              />
            </div>

            {view.sales.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="text-[15px] font-semibold">
                  {copy.empty.title}
                </div>
                <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted">
                  {view.savingsIncome.count > 0 || view.inKindIncome.count > 0
                    ? copy.empty.incomeBody
                    : copy.empty.body}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className={TAX_SALE_MIN_WIDTH}>
                  <div
                    role="row"
                    className={`grid ${TAX_SALE_GRID} items-center gap-2 border-b border-border px-gutter py-row text-[11px] font-medium tracking-wide text-muted`}
                  >
                    <span>{copy.columns.date}</span>
                    <span>{copy.columns.name}</span>
                    <span className="text-right">{copy.columns.quantity}</span>
                    <span className="text-right">
                      {copy.columns.grossAmount}
                    </span>
                    <span className="text-right">{copy.columns.fees}</span>
                    <span className="text-right">{copy.columns.costBasis}</span>
                    <span className="text-right">
                      {copy.columns.realizedPnL}
                    </span>
                    <span />
                  </div>
                  <ul>
                    {view.sales.map((sale) => (
                      <TaxSaleItem
                        key={sale.id}
                        sale={sale}
                        territory={territory}
                      />
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </Card>

          {view.integrations.length > 0 && (
            <DeferredCard
              title={copy.integrationsTitle}
              body={copy.integrationsBody(citations.repurchase)}
              columns={copy.integrationsColumns}
              rows={view.integrations.map((i) => ({
                key: `${i.integratedByEventId}:${i.originEventId}`,
                t: i.t,
                name: i.name,
                originT: i.originT,
                amount: i.amount,
              }))}
            />
          )}

          {view.pending.length > 0 && (
            <PendingDeferralsCard
              citation={citations.repurchase}
              year={view.year}
              groups={view.pendingBySale}
            />
          )}

          {(view.savingsIncome.count > 0 ||
            view.savingsIncome.finalNet !== "0") && (
            <SavingsIncomeCard
              income={view.savingsIncome}
              territory={territory}
              current={view.year === currentYear}
            />
          )}

          {view.inKindIncome.count > 0 && (
            <InKindIncomeCard income={view.inKindIncome} />
          )}

          <Card className="p-6">
            <h2 className="mb-3 text-[14px] font-semibold">
              {copy.carryforwardTitle(
                lossCarryforwardYears,
                citations.gainsCarryforward,
              )}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-140 text-[12.5px] tabular-nums">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-medium tracking-wide text-muted">
                    <th className="py-2 pr-2">
                      {copy.carryforwardColumns.year}
                    </th>
                    <th className="py-2 pr-2 text-right">
                      {copy.carryforwardColumns.ownNet}
                    </th>
                    <th className="py-2 pr-2 text-right">
                      {copy.carryforwardColumns.consumedFromCarryforward}
                    </th>
                    {crosses && (
                      <>
                        <th className="py-2 pr-2 text-right">
                          {copy.carryforwardColumns.crossOffset}
                        </th>
                        <th className="py-2 pr-2 text-right">
                          {copy.carryforwardColumns.absorbedFromOther}
                        </th>
                        <th className="py-2 pr-2 text-right">
                          {copy.carryforwardColumns.crossedToOther}
                        </th>
                      </>
                    )}
                    <th className="py-2 pr-2 text-right">
                      {copy.carryforwardColumns.finalNet}
                    </th>
                    <th className="py-2 text-right">
                      {copy.carryforwardColumns.pendingLossRemaining}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {view.carryforward.map((step) => (
                    <tr
                      key={step.year}
                      className={`border-b border-border last:border-b-0 ${
                        step.year === view.year ? "font-medium" : ""
                      }`}
                    >
                      <td className="py-2 pr-2">{step.year}</td>
                      <td className="py-2 pr-2 text-right">
                        <SignedMoney value={step.ownNet} />
                      </td>
                      <td className="py-2 pr-2 text-right">
                        {formatMoney(step.consumedFromCarryforward)}
                      </td>
                      {crosses && (
                        <>
                          <td className="py-2 pr-2 text-right">
                            <SignedMoney value={step.crossOffset} />
                          </td>
                          <td className="py-2 pr-2 text-right">
                            {formatMoney(step.absorbedFromOther)}
                          </td>
                          <td className="py-2 pr-2 text-right">
                            {formatMoney(step.crossedToOther)}
                          </td>
                        </>
                      )}
                      <td className="py-2 pr-2 text-right">
                        <SignedMoney value={step.finalNet} />
                      </td>
                      <td className="py-2 text-right">
                        {formatMoney(step.pendingLossRemaining)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryFigure({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted">
        {label}
      </div>
      <div className="mt-1 font-mono text-[20px] font-semibold tabular-nums">
        {children}
      </div>
    </div>
  );
}

function SavingsIncomeCard({
  income,
  territory,
  current,
}: {
  income: TaxSavingsIncome;
  territory: Territory;
  current: boolean;
}) {
  const { formatMoney } = useFormat();
  const copy = useCopy().realized.fiscal.savingsIncome;
  const limit = territoryRules(territory).dividendExemption?.limit;
  return (
    <FiguresCard
      title={copy.title}
      body={copy.body[territory]}
      figures={[
        { label: copy.count, value: String(income.count) },
        { label: copy.gross, value: formatMoney(income.gross) },
        ...(income.exemptSource !== null
          ? [{ label: copy.exempt, value: formatMoney(income.exempt) }]
          : []),
        { label: copy.finalNet, value: formatMoney(income.finalNet) },
      ]}
      notes={[
        ...(income.exemptSource !== null && limit !== undefined
          ? [copy.exemptNote(income.exemptSource, formatMoney(limit, 0))]
          : []),
        ...(current ? [copy.decemberInterest] : []),
      ]}
    />
  );
}

function InKindIncomeCard({ income }: { income: TaxInKindIncome }) {
  const { formatMoney } = useFormat();
  const copy = useCopy().realized.fiscal.inKind;
  return (
    <FiguresCard
      title={copy.title}
      body={copy.body}
      figures={[
        { label: copy.count, value: String(income.count) },
        { label: copy.gross, value: formatMoney(income.gross) },
        { label: copy.withheld, value: formatMoney(income.withheld) },
      ]}
    />
  );
}

function FiguresCard({
  title,
  body,
  figures,
  notes = [],
}: {
  title: string;
  body: string;
  figures: { label: string; value: string }[];
  notes?: string[];
}) {
  return (
    <Card className="p-6">
      <h2 className="text-[14px] font-semibold">{title}</h2>
      <p className="mt-1 mb-4 text-[11.5px] text-muted">{body}</p>
      <dl
        className={`grid gap-4 ${figures.length > 3 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}
      >
        {figures.map((f) => (
          <div key={f.label}>
            <dt className="text-[11px] uppercase tracking-[0.08em] text-muted">
              {f.label}
            </dt>
            <dd className="mt-1 font-mono text-[15px] tabular-nums">
              {f.value}
            </dd>
          </div>
        ))}
      </dl>
      {notes.map((note) => (
        <p key={note} className="mt-4 text-[11.5px] text-muted">
          {note}
        </p>
      ))}
    </Card>
  );
}

function negate(value: string): string {
  return new Decimal(value).negated().toFixed(2);
}

function NetLine({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between text-[12.5px] ${strong ? "font-medium" : "text-muted"}`}
    >
      <span>{label}</span>
      <span className="font-mono tabular-nums">
        <SignedMoney value={value} />
      </span>
    </div>
  );
}

function DeferredCard({
  title,
  body,
  columns,
  rows,
}: {
  title: string;
  body: string;
  columns: { t: string; name: string; origin: string; amount: string };
  rows: {
    key: string;
    t: string;
    name: string;
    originT: string;
    amount: string;
  }[];
}) {
  const { formatInstant } = useFormat();

  return (
    <Card className="p-6">
      <h2 className="text-[14px] font-semibold">{title}</h2>
      <p className="mt-1 mb-3 text-[11.5px] text-muted">{body}</p>
      <div className="overflow-x-auto">
        <div className="min-w-140">
          <div
            role="row"
            className={`grid ${TAX_DEFERRED_GRID} gap-2 border-b border-border py-2 text-[11px] font-medium tracking-wide text-muted`}
          >
            <span>{columns.t}</span>
            <span>{columns.name}</span>
            <span>{columns.origin}</span>
            <span className="text-right">{columns.amount}</span>
          </div>
          {rows.map((row) => (
            <div
              key={row.key}
              role="row"
              className={`grid ${TAX_DEFERRED_GRID} gap-2 border-b border-border py-2 text-[12.5px] last:border-b-0`}
            >
              <span className="font-mono">{formatInstant(row.t)}</span>
              <span className="truncate">{row.name}</span>
              <span className="font-mono">{formatInstant(row.originT)}</span>
              <span className="text-right font-mono tabular-nums">
                <SignedMoney value={row.amount} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
