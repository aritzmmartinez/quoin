import { Link } from "react-router";

import { type OpportunityRow, useCopy, useFormat } from "~/lib";

import { SignedMoney } from "../SignedMoney";
import { TABLE_HEAD, TABLE_NUM, TABLE_ROW, TABLE_SCROLL } from "../ui/table";

const GRID = "grid-cols-[minmax(140px,2fr)_repeat(4,minmax(90px,1fr))]";
const MIN_WIDTH = "min-w-[640px]";

export function OpportunityTable({
  rows,
}: {
  rows: readonly OpportunityRow[];
}) {
  const { formatMoney } = useFormat();
  const t = useCopy().opportunity.table;

  return (
    <div className={TABLE_SCROLL}>
      <div className={MIN_WIDTH}>
        <div role="row" className={`${TABLE_HEAD} ${GRID}`}>
          <span>{t.instrument}</span>
          <span className="text-right">{t.contributed}</span>
          <span className="text-right">{t.real}</span>
          <span className="text-right">{t.benchmark}</span>
          <span className="text-right">{t.difference}</span>
        </div>

        <ul>
          {rows.map((row) => (
            <li
              key={row.instrumentId}
              className={`${TABLE_ROW} ${GRID} min-h-11 hover:bg-surface-2`}
            >
              <Link
                to={`/instrument/${encodeURIComponent(row.instrumentId)}`}
                className="truncate text-[13px] transition-colors hover:text-text"
              >
                {row.name}
              </Link>
              <span
                className={`${TABLE_NUM} text-right font-normal text-muted`}
              >
                {formatMoney(row.contributed)}
              </span>
              <span
                className={`${TABLE_NUM} text-right font-normal text-muted`}
              >
                {formatMoney(row.realValue)}
              </span>
              <span
                className={`${TABLE_NUM} text-right font-normal text-muted`}
              >
                {formatMoney(row.benchmarkValue)}
              </span>
              <span className={`${TABLE_NUM} text-right`}>
                <SignedMoney value={row.difference} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
