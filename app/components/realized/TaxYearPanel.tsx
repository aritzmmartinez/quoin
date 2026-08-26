import { useNavigate, useSearchParams } from "react-router";

import { DASH, es, formatMoney, taxYearHref, type TaxYearView } from "~/lib";

import { Card } from "../ui/Card";
import { SignedMoney } from "../SignedMoney";
import { TaxSaleItem } from "./TaxSaleItem";
import { TAX_SALE_GRID, TAX_SALE_MIN_WIDTH } from "./tax-columns";

function TaxYearSelect({ years, year }: { years: number[]; year: number }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const copy = es.realized.fiscal;

  return (
    <select
      id="tax-year"
      aria-label={copy.yearLabel}
      value={year}
      onChange={(e) => navigate(taxYearHref(params, Number(e.target.value)))}
      className="rounded-md border border-border bg-surface px-2 py-1.5 text-[12px]"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
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
  const copy = es.realized.fiscal;

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
      <p className="max-w-3xl text-[12px] text-muted">{copy.intro}</p>

      <div className="flex items-center gap-2">
        <label className="text-[12px] text-muted" htmlFor="tax-year">
          {copy.yearLabel}
        </label>
        <TaxYearSelect years={years} year={year} />
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

          <Card className="p-6">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-[14px] font-semibold">{copy.salesTitle}</h2>
              <span className="text-[11.5px] text-muted">
                {copy.net.counts(view.allowedCount, view.disallowedCount)}
              </span>
            </div>
            <div className="mt-3 flex justify-between text-[12.5px] text-muted">
              <span>{copy.net.before}</span>
              <span className="tabular-nums">
                <SignedMoney value={view.ownNetBeforeExclusion} />
              </span>
            </div>
            <div className="flex justify-between text-[12.5px] font-medium">
              <span>{copy.net.after}</span>
              <span className="tabular-nums">
                <SignedMoney value={view.allowedNet} />
              </span>
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
              <div className="mt-4 overflow-x-auto">
                <div className={TAX_SALE_MIN_WIDTH}>
                  <div
                    role="row"
                    className={`grid ${TAX_SALE_GRID} items-center gap-2 border-b border-border py-2 text-[11px] font-medium tracking-wide text-muted`}
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
                      <TaxSaleItem key={sale.id} sale={sale} />
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </Card>

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
