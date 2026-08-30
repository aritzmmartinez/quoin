import {
  es,
  formatDate,
  formatMoney,
  formatPercent,
  type TargetRow,
} from "~/lib";

const GRID = "grid-cols-[minmax(0,1fr)_140px_90px] items-center gap-2";

export function TargetLines({
  rows,
  total,
  activeFrom,
  note,
}: {
  rows: TargetRow[];
  total: string;
  activeFrom: string;
  note: string | null;
}) {
  const copy = es.target;

  return (
    <div>
      <div className="border-b border-border px-gutter py-row">
        <p className="text-[13px]">{copy.activeFrom(formatDate(activeFrom))}</p>
        {note && <p className="mt-1 text-[12px] text-muted">{note}</p>}
      </div>

      <div
        className={`grid ${GRID} border-b border-border px-gutter py-row text-[11px] font-medium tracking-wide text-muted`}
      >
        <span>{copy.columns.instrument}</span>
        <span className="text-right">{copy.columns.amount}</span>
        <span className="text-right">{copy.columns.weight}</span>
      </div>

      <ul>
        {rows.map((row) => (
          <li
            key={row.instrumentId}
            className={`grid ${GRID} border-b border-border px-gutter py-row text-[13px] last:border-b-0`}
          >
            <div className="min-w-0">
              <div className="truncate">{row.name}</div>
              <div className="font-mono text-[11px] text-muted">
                {row.instrumentId}
                {(!row.known || !row.held) && (
                  <span className="ml-2 rounded-full border border-border px-1.5 py-0.5 font-sans text-[10px] tracking-wide">
                    {row.known ? copy.notHeld : copy.notImported}
                  </span>
                )}
              </div>
            </div>
            <span className="text-right tabular-nums">
              {formatMoney(row.monthlyAmount)}
            </span>
            <span className="text-right tabular-nums text-muted">
              {formatPercent(row.weight)}
            </span>
          </li>
        ))}
      </ul>

      <div
        className={`grid ${GRID} border-t border-border px-gutter py-row text-[13px]`}
      >
        <span className="text-muted">{copy.total}</span>
        <span className="text-right tabular-nums">{formatMoney(total)}</span>
        <span />
      </div>
    </div>
  );
}
