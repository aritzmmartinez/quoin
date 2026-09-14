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
import { ThesisChip } from "../ui/ThesisChip";
import { signClass, signedPercent } from "../ui/signed";
import { SortableHeader } from "../portfolio/SortableHeader";
import {
  TABLE_CELLS,
  TABLE_DIVIDER,
  TABLE_HEAD,
  TABLE_NUM,
  TABLE_SCROLL,
} from "../ui/table";
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
      className={`${TABLE_SCROLL} transition-opacity ${busy ? "opacity-60" : ""}`}
    >
      <div className={REALIZED_MIN_WIDTH}>
        <div role="row" className={`${TABLE_HEAD} ${REALIZED_GRID}`}>
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
      className={`${TABLE_CELLS} ${REALIZED_GRID} min-h-10 border-b border-border-subtle font-mono text-[12.5px] ${className}`}
    >
      <span className="font-semibold text-text">{label}</span>
      <span className="truncate">{es.realized.sales(totals.count)}</span>
      <span />
      <span />
      <span className={`${TABLE_NUM} text-right`}>
        {formatMoney(totals.grossAmount)}
      </span>
      <span className={`${TABLE_NUM} text-right`}>
        {formatMoney(totals.fees)}
      </span>
      <span className={`${TABLE_NUM} text-right`}>
        {formatMoney(totals.costBasis)}
      </span>
      <span className={`${TABLE_NUM} text-right`}>
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
    <li className={TABLE_DIVIDER}>
      <Link
        to={`/instrument/${encodeURIComponent(row.instrumentId)}`}
        className={`${TABLE_CELLS} ${REALIZED_GRID} min-h-11 hover:bg-surface-2`}
      >
        <span className={`${TABLE_NUM} font-normal text-muted`}>
          {formatDate(row.t)}
        </span>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold">
              {row.name}
            </span>
            <ThesisChip thesis={row.thesis} />
          </div>
          <div className="mt-1 font-mono text-[11px] text-muted">
            {row.instrumentId}
          </div>
        </div>

        <span className={`${TABLE_NUM} text-right`}>
          {formatQuantity(row.quantity)}
        </span>
        <span className={`${TABLE_NUM} text-right`}>
          {row.price === null ? DASH : formatMoney(row.price)}
        </span>
        <span className={`${TABLE_NUM} text-right`}>
          {formatMoney(row.grossAmount)}
        </span>
        <span className={`${TABLE_NUM} text-right font-normal text-muted`}>
          {Number(row.fees) === 0 ? DASH : formatMoney(row.fees)}
        </span>
        <span className={`${TABLE_NUM} text-right`}>
          {formatMoney(row.costBasis)}
        </span>
        <span className={`${TABLE_NUM} text-right`}>
          <SignedMoney value={row.realizedPnL} />
        </span>
        <span className={`${TABLE_NUM} text-right ${signClass(row.returnPct)}`}>
          {signedPercent(row.returnPct)}
        </span>
        <span className={`${TABLE_NUM} text-right font-normal text-muted`}>
          {row.holdingDays === null ? DASH : es.realized.days(row.holdingDays)}
        </span>
      </Link>
    </li>
  );
}
