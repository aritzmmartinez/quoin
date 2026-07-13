import { useState } from "react";

import {
  DASH,
  es,
  formatDate,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatSignedMoney,
  instrumentTypeLabel,
  type PortfolioRow,
} from "~/lib";

import { SignedMoney } from "../SignedMoney";
import { SleeveChip } from "../ui/SleeveChip";
import { GRID_TEMPLATE } from "./columns";

function Chevron({ open }: { open: boolean }) {
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
      className={`transition-transform ${open ? "rotate-90" : ""}`}
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** One expandable position row. Expansion state is local. Market cells fall back
 * to "—" when the instrument has no usable price. */
export function PortfolioRowItem({ row }: { row: PortfolioRow }) {
  const [open, setOpen] = useState(false);
  const detailId = `pos-${row.key}`;

  const detail = [
    { label: es.portfolio.detail.isin, value: row.instrumentId },
    { label: es.portfolio.detail.currency, value: row.currency ?? DASH },
    { label: es.portfolio.detail.assetClass, value: row.assetClass ?? DASH },
    { label: es.portfolio.detail.realizedPnL, value: formatSignedMoney(row.realizedPnL).text },
    {
      label: es.portfolio.detail.firstTrade,
      value: row.firstTradeAt ? formatDate(row.firstTradeAt) : DASH,
    },
    {
      label: es.portfolio.detail.lastTrade,
      value: row.lastTradeAt ? formatDate(row.lastTradeAt) : DASH,
    },
    { label: es.portfolio.detail.tradeCount, value: String(row.tradeCount) },
  ];

  return (
    <li className="border-b border-border last:border-b-0">
      {/* Mouse users can click anywhere on the row; keyboard users use the chevron button. */}
      <div
        className={`grid ${GRID_TEMPLATE} cursor-pointer items-center gap-2 px-5 py-3 transition-colors hover:bg-surface-2`}
        onClick={() => setOpen((o) => !o)}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          aria-expanded={open}
          aria-controls={detailId}
          aria-label={es.portfolio.expandLabel}
          className="grid size-6 place-items-center rounded text-muted transition-colors hover:text-text"
        >
          <Chevron open={open} />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{row.name}</span>
            <SleeveChip sleeve={row.sleeve} />
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted">{row.instrumentId}</div>
        </div>

        <div className="text-[13px] text-muted">
          {row.type ? instrumentTypeLabel(row.type) : DASH}
        </div>
        <div className="text-right text-[13.5px]">{formatQuantity(row.quantity)}</div>
        <div className="text-right text-[13.5px]">{formatMoney(row.averageCost)}</div>
        <div className="text-right text-[13.5px]">{formatMoney(row.costBasis)}</div>
        <div className="text-right text-[13.5px] font-medium">
          {row.marketValue !== null ? formatMoney(row.marketValue) : DASH}
        </div>
        <div className="text-right text-[13.5px] font-medium">
          {row.unrealizedPnL !== null ? <SignedMoney value={row.unrealizedPnL} /> : DASH}
        </div>
        <div className="text-right text-[13.5px] text-muted">
          {row.weight !== null ? formatPercent(row.weight) : DASH}
        </div>
      </div>

      {open && (
        <div
          id={detailId}
          className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4 px-5 pb-4 pl-16 pt-1"
        >
          {detail.map((d) => (
            <div key={d.label}>
              <div className="mb-1 text-[11px] text-muted">{d.label}</div>
              <div className="text-[13px] font-medium">{d.value}</div>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
