import { Link, useSearchParams } from "react-router";

import {
  DASH,
  es,
  formatDate,
  formatMoney,
  formatQuantity,
  nextRealizedSort,
  type RealizedRow,
  type RealizedSort,
  type RealizedSortKey,
  type RealizedTotals,
  type RealizedYear,
} from "~/lib";

import { SignedMoney } from "../SignedMoney";
import { SleeveChip } from "../ui/SleeveChip";
import { signClass, signedPercent } from "../ui/signed";
import { SortableHeader } from "../portfolio/SortableHeader";
import { REALIZED_COLUMNS, REALIZED_GRID, REALIZED_MIN_WIDTH } from "./columns";

export function RealizedTable({
  years,
  totals,
  sort,
  busy = false,
}: {
  years: RealizedYear[];
  totals: RealizedTotals;
  sort: RealizedSort;
  busy?: boolean;
}) {
  const [params] = useSearchParams();

  const hrefFor = (key: RealizedSortKey): string => {
    const next = nextRealizedSort(key, sort);
    const p = new URLSearchParams(params);
    p.set("sort", next.key);
    p.set("dir", next.dir);
    return `?${p.toString()}`;
  };

  return (
    <div
      aria-busy={busy}
      className={`overflow-x-auto transition-opacity ${busy ? "opacity-60" : ""}`}
    >
      <div className={REALIZED_MIN_WIDTH}>
        <div
          role="row"
          className={`grid ${REALIZED_GRID} items-center gap-2 border-b border-border px-gutter py-row`}
        >
          {REALIZED_COLUMNS.map((col) => (
            <SortableHeader
              key={col.key}
              label={es.realized.columns[col.key]}
              href={hrefFor(col.key)}
              align={col.align}
              active={sort.key === col.key}
              dir={sort.dir}
            />
          ))}
        </div>

        {years.map((year) => (
          <section key={year.year}>
            <TotalsBand
              label={String(year.year)}
              totals={year.totals}
              className="bg-surface-2 text-muted"
            />
            <ul>
              {year.rows.map((row) => (
                <RealizedRowItem key={row.id} row={row} />
              ))}
            </ul>
          </section>
        ))}

        {years.length > 1 && (
          <TotalsBand
            label={es.realized.total}
            totals={totals}
            className="border-t-2 border-border font-medium"
          />
        )}
      </div>
    </div>
  );
}

function TotalsBand({
  label,
  totals,
  className = "",
}: {
  label: string;
  totals: RealizedTotals;
  className?: string;
}) {
  return (
    <div
      className={`grid ${REALIZED_GRID} items-center gap-2 border-b border-border px-gutter py-row text-[12.5px] tabular-nums ${className}`}
    >
      <span className="font-semibold text-text">{label}</span>
      <span className="truncate">{es.realized.sales(totals.count)}</span>
      <span />
      <span />
      <span className="text-right">{formatMoney(totals.grossAmount)}</span>
      <span className="text-right">{formatMoney(totals.fees)}</span>
      <span className="text-right">{formatMoney(totals.costBasis)}</span>
      <span className="text-right font-medium">
        <SignedMoney value={totals.realizedPnL} />
      </span>
      <span className={`text-right ${signClass(totals.returnPct)}`}>
        {signedPercent(totals.returnPct)}
      </span>
      <span />
    </div>
  );
}

function RealizedRowItem({ row }: { row: RealizedRow }) {
  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        to={`/instrument/${encodeURIComponent(row.instrumentId)}`}
        className={`grid ${REALIZED_GRID} items-center gap-2 px-gutter py-row text-[13px] tabular-nums transition-colors hover:bg-surface-2`}
      >
        <span className="text-muted">{formatDate(row.t)}</span>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{row.name}</span>
            <SleeveChip sleeve={row.sleeve} />
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted">
            {row.instrumentId}
          </div>
        </div>

        <span className="text-right">{formatQuantity(row.quantity)}</span>
        <span className="text-right">
          {row.price === null ? DASH : formatMoney(row.price)}
        </span>
        <span className="text-right">{formatMoney(row.grossAmount)}</span>
        <span className="text-right text-muted">
          {Number(row.fees) === 0 ? DASH : formatMoney(row.fees)}
        </span>
        <span className="text-right">{formatMoney(row.costBasis)}</span>
        <span className="text-right font-medium">
          <SignedMoney value={row.realizedPnL} />
        </span>
        <span className={`text-right ${signClass(row.returnPct)}`}>
          {signedPercent(row.returnPct)}
        </span>
        <span className="text-right text-muted">
          {row.holdingDays === null ? DASH : es.realized.days(row.holdingDays)}
        </span>
      </Link>
    </li>
  );
}
