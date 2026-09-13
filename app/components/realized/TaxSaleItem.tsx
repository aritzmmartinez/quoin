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
import { ThesisChip } from "../ui/ThesisChip";
import { TABLE_CELLS, TABLE_DIVIDER, TABLE_NUM } from "../ui/table";
import { TAX_LOT_GRID, TAX_SALE_GRID } from "./tax-columns";

export function TaxSaleItem({ sale }: { sale: TaxSaleRow }) {
  const [open, setOpen] = useState(false);
  const copy = es.realized.fiscal;

  return (
    <li className={TABLE_DIVIDER}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? copy.collapse : copy.expand}
        className={`${TABLE_CELLS} ${TAX_SALE_GRID} min-h-11 w-full text-left hover:bg-surface-2 ${
          sale.disallowed ? "border-l-2 border-negative bg-negative/4" : ""
        }`}
      >
        <span className={`${TABLE_NUM} font-normal text-muted`}>
          {formatDate(sale.t)}
        </span>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold">
              {sale.name}
            </span>
            <ThesisChip thesis={sale.thesis} />
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

        <span className={`${TABLE_NUM} text-right`}>
          {formatQuantity(sale.quantity)}
        </span>
        <span className={`${TABLE_NUM} text-right`}>
          {formatMoney(sale.grossAmount)}
        </span>
        <span className={`${TABLE_NUM} text-right font-normal text-muted`}>
          {Number(sale.fees) === 0 ? DASH : formatMoney(sale.fees)}
        </span>
        <span className={`${TABLE_NUM} text-right`}>
          {formatMoney(sale.costBasis)}
        </span>
        <span className={`${TABLE_NUM} text-right`}>
          <SignedMoney value={sale.realizedPnL} />
        </span>
        <span aria-hidden="true" className="justify-self-end text-muted">
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <div className="border-t border-border-subtle bg-surface-2 px-gutter py-3">
          <div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted">
            {copy.lotsTitle}
          </div>
          <div
            className={`grid ${TAX_LOT_GRID} gap-2 pb-1 text-[11px] font-medium text-muted`}
          >
            <span>{copy.lotsColumns.acquiredAt}</span>
            <span className={`${TABLE_NUM} text-right`}>
              {copy.lotsColumns.quantity}
            </span>
            <span className={`${TABLE_NUM} text-right`}>
              {copy.lotsColumns.unitCost}
            </span>
          </div>
          {sale.lots.map((lot) => (
            <div
              key={lot.buyEventId}
              className={`grid ${TAX_LOT_GRID} gap-2 py-1 font-mono text-[12px]`}
            >
              <span>{formatDate(lot.acquiredAt)}</span>
              <span className={`${TABLE_NUM} text-right`}>
                {formatQuantity(lot.quantity)}
              </span>
              <span className={`${TABLE_NUM} text-right`}>
                {formatMoney(lot.unitCost, 4)}
              </span>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
