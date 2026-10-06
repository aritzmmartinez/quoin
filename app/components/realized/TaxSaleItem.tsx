import { useState } from "react";

import {
  DASH,
  type TaxSaleRow,
  type TaxWashSaleRow,
  useCopy,
  useFormat,
} from "~/lib";

import { SignedMoney } from "../SignedMoney";
import { ThesisChip } from "../ui/ThesisChip";
import { TABLE_CELLS, TABLE_DIVIDER, TABLE_NUM } from "../ui/table";
import {
  TAX_BREAKDOWN_GRID,
  TAX_LOT_GRID,
  TAX_RECIPIENT_GRID,
  TAX_SALE_GRID,
} from "./tax-columns";

const BADGE =
  "shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide";

export function TaxSaleItem({
  sale,
  windowMonths,
}: {
  sale: TaxSaleRow;
  windowMonths: number;
}) {
  const {
    formatMoney,
    formatQuantity,
    formatDate,
    formatPercent,
    formatSignedMoney,
  } = useFormat();
  const t = useCopy();
  const [open, setOpen] = useState(false);
  const copy = t.realized.fiscal;
  const washSale = sale.washSale;

  return (
    <li className={TABLE_DIVIDER}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? copy.collapse : copy.expand}
        className={`${TABLE_CELLS} ${TAX_SALE_GRID} min-h-11 w-full text-left hover:bg-surface-2 ${
          washSale ? "border-l-2 border-negative bg-negative/4" : ""
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
            {washSale && (
              <span
                className={`${BADGE} border-negative/40 bg-negative/10 text-negative`}
              >
                {copy.washSaleBadge}
              </span>
            )}
            {sale.unlistedRepurchaseAt && (
              <span className={`${BADGE} border-border text-muted`}>
                {copy.unlistedBadge}
              </span>
            )}
          </div>
          {washSale && (
            <div className="mt-0.5 text-[11.5px] leading-snug text-negative">
              {copy.washSaleReason(
                formatQuantity(washSale.repurchased),
                formatQuantity(sale.quantity),
              )}
              {sale.nonComputable !== "0" &&
                ` ${copy.ownDeferredReason(
                  formatPercent(washSale.fraction),
                  formatSignedMoney(sale.nonComputable).text,
                )}`}
              {sale.carriedOver !== "0" &&
                ` ${copy.carriedOverReason(formatSignedMoney(sale.carriedOver).text)}`}
            </div>
          )}
          {sale.unlistedRepurchaseAt && (
            <div className="mt-0.5 text-[11.5px] leading-snug text-muted">
              {copy.unlistedReason(formatDate(sale.unlistedRepurchaseAt))}
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
          {washSale && (
            <WashSaleBreakdown
              sale={sale}
              washSale={washSale}
              months={windowMonths}
            />
          )}

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

function WashSaleBreakdown({
  sale,
  washSale,
  months,
}: {
  sale: TaxSaleRow;
  washSale: TaxWashSaleRow;
  months: number;
}) {
  const { formatQuantity, formatDate, formatPercent, formatSignedMoney } =
    useFormat();
  const copy = useCopy().realized.fiscal.breakdown;

  const rows: [string, string][] = [
    [copy.before(months), formatQuantity(washSale.before)],
    [copy.remainingAfter, formatQuantity(washSale.remainingAfter)],
    [copy.repurchaseBefore, formatQuantity(washSale.repurchaseBefore)],
    [copy.repurchaseAfter(months), formatQuantity(washSale.repurchaseAfter)],
    [copy.repurchased, formatQuantity(washSale.repurchased)],
    [copy.share, formatPercent(washSale.fraction, 2)],
  ];
  if (sale.nonComputable !== "0") {
    rows.push([copy.nonComputable, formatSignedMoney(sale.nonComputable).text]);
  }
  if (sale.carriedOver !== "0") {
    rows.push([copy.carriedOver, formatSignedMoney(sale.carriedOver).text]);
  }

  return (
    <div className="mb-4">
      <div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted">
        {copy.title}
      </div>
      {rows.map(([label, value]) => (
        <div
          key={label}
          className={`grid ${TAX_BREAKDOWN_GRID} gap-2 py-0.5 text-[12px]`}
        >
          <span className="text-muted">{label}</span>
          <span className={`${TABLE_NUM} text-right`}>{value}</span>
        </div>
      ))}

      <div className="mt-3 mb-2 text-[11px] uppercase tracking-[0.08em] text-muted">
        {copy.recipientsTitle}
      </div>
      <div
        className={`grid ${TAX_RECIPIENT_GRID} gap-2 pb-1 text-[11px] font-medium text-muted`}
      >
        <span>{copy.recipientsColumns.acquiredAt}</span>
        <span className={`${TABLE_NUM} text-right`}>
          {copy.recipientsColumns.quantity}
        </span>
        <span className={`${TABLE_NUM} text-right`}>
          {copy.recipientsColumns.deferredLoss}
        </span>
      </div>
      {washSale.recipients.map((r) => (
        <div
          key={r.buyEventId}
          className={`grid ${TAX_RECIPIENT_GRID} gap-2 py-1 font-mono text-[12px]`}
        >
          <span>{formatDate(r.acquiredAt)}</span>
          <span className={`${TABLE_NUM} text-right`}>
            {formatQuantity(r.quantity)}
          </span>
          <span className={`${TABLE_NUM} text-right`}>
            <SignedMoney value={r.deferredLoss} />
          </span>
        </div>
      ))}
    </div>
  );
}
