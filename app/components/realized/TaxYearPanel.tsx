import Decimal from "decimal.js";
import { useNavigate, useSearchParams } from "react-router";

import { DASH, taxYearHref, type TaxYearView, useCopy, useFormat } from "~/lib";

import { Card } from "../ui/Card";
import { InfoHint } from "../ui/Hint";
import { Select } from "../ui/Select";
import { SignedMoney } from "../SignedMoney";
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
  view,
}: {
  years: number[];
  year: number | null;
  view: TaxYearView | null;
}) {
  const { formatMoney } = useFormat();
  const t = useCopy();
  const copy = t.realized.fiscal;

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
        <InfoHint size={18} name={copy.about} label={copy.intro} />
      </div>

      {view && (
        <>
          <Card className="p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-[11px] uppercase tracking-[0.08em] text-muted">
                  {copy.summary.netBase}
                </div>
                <div className="mt-1 text-[20px] font-semibold tabular-nums">
                  <SignedMoney value={view.netSavingsBase} />
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.08em] text-muted">
                  {copy.summary.quota}
                </div>
                <div className="mt-1 text-[20px] font-semibold tabular-nums">
                  {view.quota === null ? DASH : formatMoney(view.quota)}
                </div>
              </div>
            </div>
            <p className="mt-4 text-[11.5px] text-muted">
              {view.scale
                ? copy.summary.scale(view.scale.source)
                : copy.summary.noScale}
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
                  label={copy.net.nonComputable}
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
                  {copy.empty.body}
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
                        windowMonths={view.washSaleWindowMonths}
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
              body={copy.integrationsBody}
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
            <DeferredCard
              title={copy.pendingTitle(view.year)}
              body={copy.pendingBody}
              columns={copy.pendingColumns}
              rows={view.pending.flatMap((p) =>
                p.origins.map((o) => ({
                  key: `${p.buyEventId}:${o.originEventId}`,
                  t: p.acquiredAt,
                  name: p.name,
                  originT: o.originT,
                  amount: o.amount,
                })),
              )}
            />
          )}

          <Card className="p-6">
            <h2 className="mb-3 text-[14px] font-semibold">
              {copy.carryforwardTitle}
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
  const { formatDate } = useFormat();

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
              <span className="font-mono">{formatDate(row.t)}</span>
              <span className="truncate">{row.name}</span>
              <span className="font-mono">{formatDate(row.originT)}</span>
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
