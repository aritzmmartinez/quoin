import { useState } from "react";

import { type TaxPendingGroup, useCopy, useFormat } from "~/lib";

import { Card } from "../ui/Card";
import {
  TABLE_CELLS,
  TABLE_DIVIDER,
  TABLE_HEAD,
  TABLE_NUM,
  TABLE_SCROLL,
} from "../ui/table";
import { DeferredAmount } from "./DeferredAmount";
import {
  TAX_PENDING_DETAIL_GRID,
  TAX_PENDING_GROUP_GRID,
  TAX_PENDING_MIN_WIDTH,
} from "./tax-columns";

export function PendingDeferralsCard({
  year,
  groups,
}: {
  year: number;
  groups: readonly TaxPendingGroup[];
}) {
  const copy = useCopy().realized.fiscal;

  return (
    <Card>
      <div className="border-b border-border px-gutter py-4">
        <h2 className="text-[14px] font-semibold">{copy.pendingTitle(year)}</h2>
        <p className="mt-1 text-[11.5px] text-muted">{copy.pendingBody}</p>
      </div>
      <div className={TABLE_SCROLL}>
        <div className={TAX_PENDING_MIN_WIDTH}>
          <div role="row" className={`${TABLE_HEAD} ${TAX_PENDING_GROUP_GRID}`}>
            <span>{copy.pendingGroupColumns.saleDate}</span>
            <span>{copy.pendingGroupColumns.name}</span>
            <span className="text-right">
              {copy.pendingGroupColumns.acquisitions}
            </span>
            <span className="text-right">
              {copy.pendingGroupColumns.amount}
            </span>
            <span />
          </div>
          <ul>
            {groups.map((group) => (
              <PendingGroupItem key={group.key} group={group} />
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function PendingGroupItem({ group }: { group: TaxPendingGroup }) {
  const { formatDate } = useFormat();
  const copy = useCopy().realized.fiscal;
  const [open, setOpen] = useState(false);

  return (
    <li className={TABLE_DIVIDER}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? copy.collapse : copy.expand}
        className={`${TABLE_CELLS} ${TAX_PENDING_GROUP_GRID} min-h-11 w-full text-left text-[12.5px] hover:bg-surface-2`}
      >
        <span className="font-mono">{formatDate(group.saleT)}</span>
        <span className="truncate">{group.name}</span>
        <span className="text-right text-muted">
          {copy.acquisitionsCount(group.acquisitions.length)}
        </span>
        <span className={`${TABLE_NUM} text-right`}>
          <DeferredAmount value={group.amount} />
        </span>
        <span aria-hidden="true" className="justify-self-end text-muted">
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <div className="border-t border-border-subtle bg-surface-2 px-gutter py-3">
          <div
            className={`grid ${TAX_PENDING_DETAIL_GRID} gap-2 pb-1 text-[11px] font-medium text-muted`}
          >
            <span>{copy.pendingDetailColumns.acquiredAt}</span>
            <span className="text-right">
              {copy.pendingDetailColumns.amount}
            </span>
          </div>
          {group.acquisitions.map((acquisition) => (
            <div
              key={acquisition.buyEventId}
              className={`grid ${TAX_PENDING_DETAIL_GRID} gap-2 py-1 text-[12px]`}
            >
              <span className="font-mono">
                {formatDate(acquisition.acquiredAt)}
              </span>
              <span className={`${TABLE_NUM} text-right`}>
                <DeferredAmount value={acquisition.amount} />
              </span>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
