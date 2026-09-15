import { Link } from "react-router";

import { DASH, type PortfolioRow, useCopy, useFormat } from "~/lib";

import { SignedMoney } from "../SignedMoney";
import { ThesisChip } from "../ui/ThesisChip";
import { TABLE_CELLS, TABLE_DIVIDER, TABLE_NUM } from "../ui/table";
import { GRID_TEMPLATE } from "./columns";

function ChevronRight() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function PortfolioRowItem({ row }: { row: PortfolioRow }) {
  const { formatMoney, formatQuantity, formatPercent } = useFormat();
  const { labels } = useCopy();
  return (
    <li className={TABLE_DIVIDER}>
      <Link
        to={`/instrument/${encodeURIComponent(row.instrumentId)}`}
        className={`${TABLE_CELLS} ${GRID_TEMPLATE} min-h-15.25 hover:bg-surface-2`}
      >
        <span className="grid size-6 place-items-center text-faint">
          <ChevronRight />
        </span>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-semibold">
              {row.name}
            </span>
            <ThesisChip thesis={row.thesis} />
          </div>
          <div className="mt-1 font-mono text-[11px] text-muted">
            {row.instrumentId}
          </div>
        </div>

        <div className="text-[13px] text-muted">
          {row.type ? labels.instrumentType[row.type] : DASH}
        </div>
        <div className={`${TABLE_NUM} text-right`}>
          {formatQuantity(row.quantity)}
        </div>
        <div className={`${TABLE_NUM} text-right`}>
          {formatMoney(row.averageCost)}
        </div>
        <div className={`${TABLE_NUM} text-right`}>
          {formatMoney(row.costBasis)}
        </div>
        <div className={`${TABLE_NUM} text-right`}>
          {row.marketValue !== null ? formatMoney(row.marketValue) : DASH}
        </div>
        <div className={`${TABLE_NUM} text-right`}>
          {row.unrealizedPnL !== null ? (
            <SignedMoney value={row.unrealizedPnL} />
          ) : (
            DASH
          )}
        </div>
        <div className={`${TABLE_NUM} text-right font-normal text-muted`}>
          {row.weight !== null ? formatPercent(row.weight) : DASH}
        </div>
      </Link>
    </li>
  );
}
