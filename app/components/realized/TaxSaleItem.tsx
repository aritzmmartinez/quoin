import { useState } from "react";

import {
  DASH,
  es,
  formatDate,
  formatMoney,
  formatQuantity,
  type TaxSaleRow,
} from "~/lib";

import { SignedMoney } from "../SignedMoney";
import { SleeveChip } from "../ui/SleeveChip";
import { TAX_LOT_GRID, TAX_SALE_GRID } from "./tax-columns";

export function TaxSaleItem({ sale }: { sale: TaxSaleRow }) {
  const [open, setOpen] = useState(false);
  const copy = es.realized.fiscal;

  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? copy.collapse : copy.expand}
        className={`grid ${TAX_SALE_GRID} w-full items-center gap-2 px-5 py-3 text-left text-[13px] tabular-nums transition-colors hover:bg-surface-2 ${
          sale.disallowed ? "border-l-2 border-negative bg-negative/4" : ""
        }`}
      >
        <span className="text-muted">{formatDate(sale.t)}</span>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{sale.name}</span>
            <SleeveChip sleeve={sale.sleeve} />
            {sale.disallowed && (
              <span className="shrink-0 rounded-md border border-negative/40 bg-negative/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-negative">
                {copy.disallowedBadge}
              </span>
            )}
          </div>
          {sale.disallowed && sale.disallowedReason && (
            <div className="mt-0.5 text-[11.5px] leading-snug text-negative">
              {sale.disallowedReason}
            </div>
          )}
        </div>

        <span className="text-right">{formatQuantity(sale.quantity)}</span>
        <span className="text-right">{formatMoney(sale.grossAmount)}</span>
        <span className="text-right text-muted">
          {Number(sale.fees) === 0 ? DASH : formatMoney(sale.fees)}
        </span>
        <span className="text-right">{formatMoney(sale.costBasis)}</span>
        <span className="text-right font-medium">
          <SignedMoney value={sale.realizedPnL} />
        </span>
        <span aria-hidden="true" className="justify-self-end text-muted">
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <div className="border-t border-border bg-surface-2 px-5 py-3">
          <div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted">
            {copy.lotsTitle}
          </div>
          <div
            className={`grid ${TAX_LOT_GRID} gap-2 pb-1 text-[11px] font-medium text-muted`}
          >
            <span>{copy.lotsColumns.acquiredAt}</span>
            <span className="text-right">{copy.lotsColumns.quantity}</span>
            <span className="text-right">{copy.lotsColumns.unitCost}</span>
          </div>
          {sale.lots.map((lot) => (
            <div
              key={lot.buyEventId}
              className={`grid ${TAX_LOT_GRID} gap-2 py-1 text-[12.5px] tabular-nums`}
            >
              <span>{formatDate(lot.acquiredAt)}</span>
              <span className="text-right">{formatQuantity(lot.quantity)}</span>
              <span className="text-right">{formatMoney(lot.unitCost, 4)}</span>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
