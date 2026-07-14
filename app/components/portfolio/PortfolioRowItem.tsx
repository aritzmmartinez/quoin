import { Link } from "react-router";

import {
  DASH,
  formatMoney,
  formatPercent,
  formatQuantity,
  instrumentTypeLabel,
  type PortfolioRow,
} from "~/lib";

import { SignedMoney } from "../SignedMoney";
import { SleeveChip } from "../ui/SleeveChip";
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
  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        to={`/instrument/${encodeURIComponent(row.instrumentId)}`}
        className={`grid ${GRID_TEMPLATE} items-center gap-2 px-5 py-3 transition-colors hover:bg-surface-2`}
      >
        <span className="grid size-6 place-items-center text-muted">
          <ChevronRight />
        </span>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{row.name}</span>
            <SleeveChip sleeve={row.sleeve} />
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted">
            {row.instrumentId}
          </div>
        </div>

        <div className="text-[13px] text-muted">
          {row.type ? instrumentTypeLabel(row.type) : DASH}
        </div>
        <div className="text-right text-[13.5px]">
          {formatQuantity(row.quantity)}
        </div>
        <div className="text-right text-[13.5px]">
          {formatMoney(row.averageCost)}
        </div>
        <div className="text-right text-[13.5px]">
          {formatMoney(row.costBasis)}
        </div>
        <div className="text-right text-[13.5px] font-medium">
          {row.marketValue !== null ? formatMoney(row.marketValue) : DASH}
        </div>
        <div className="text-right text-[13.5px] font-medium">
          {row.unrealizedPnL !== null ? (
            <SignedMoney value={row.unrealizedPnL} />
          ) : (
            DASH
          )}
        </div>
        <div className="text-right text-[13.5px] text-muted">
          {row.weight !== null ? formatPercent(row.weight) : DASH}
        </div>
      </Link>
    </li>
  );
}
