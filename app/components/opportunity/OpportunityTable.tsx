import { Link } from "react-router";

import { es, formatMoney, type OpportunityRow } from "~/lib";

import { SignedMoney } from "../SignedMoney";

const GRID = "grid-cols-[minmax(140px,2fr)_repeat(4,minmax(90px,1fr))]";
const MIN_WIDTH = "min-w-[640px]";

export function OpportunityTable({
  rows,
}: {
  rows: readonly OpportunityRow[];
}) {
  const t = es.opportunity.table;

  return (
    <div className="overflow-x-auto">
      <div className={MIN_WIDTH}>
        <div
          role="row"
          className={`grid ${GRID} items-center gap-2 border-b border-border px-gutter py-row text-[11px] font-medium tracking-wide text-muted`}
        >
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
              className={`grid ${GRID} items-center gap-2 border-b border-border px-gutter py-row text-[13px] tabular-nums last:border-b-0 hover:bg-surface-2`}
            >
              <Link
                to={`/instrument/${encodeURIComponent(row.instrumentId)}`}
                className="truncate transition-colors hover:text-text"
              >
                {row.name}
              </Link>
              <span className="text-right text-muted">
                {formatMoney(row.contributed)}
              </span>
              <span className="text-right text-muted">
                {formatMoney(row.realValue)}
              </span>
              <span className="text-right text-muted">
                {formatMoney(row.benchmarkValue)}
              </span>
              <span className="text-right font-medium">
                <SignedMoney value={row.difference} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
