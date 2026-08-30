import { useSearchParams } from "react-router";

import {
  es,
  nextSort,
  type PortfolioRow,
  type Sort,
  type SortKey,
} from "~/lib";

import { COLUMNS, GRID_TEMPLATE, TABLE_MIN_WIDTH } from "./columns";
import { PortfolioRowItem } from "./PortfolioRowItem";
import { SortableHeader } from "./SortableHeader";

export function PortfolioTable({
  rows,
  sort,
  busy = false,
}: {
  rows: PortfolioRow[];
  sort: Sort;
  busy?: boolean;
}) {
  const [params] = useSearchParams();

  const hrefFor = (key: SortKey): string => {
    const next = nextSort(key, sort);
    const p = new URLSearchParams(params);
    p.set("sort", next.key);
    p.set("dir", next.dir);
    return `?${p.toString()}`;
  };

  return (
    <div
      aria-busy={busy}
      className={`overflow-x-auto transition-opacity ${busy ? "opacity-60" : ""}`}
    >
      <div className={TABLE_MIN_WIDTH}>
        <div
          role="row"
          className={`grid ${GRID_TEMPLATE} items-center gap-2 border-b border-border px-gutter py-row`}
        >
          <span />
          {COLUMNS.map((col) => (
            <SortableHeader
              key={col.key}
              label={es.portfolio.columns[col.key]}
              href={hrefFor(col.key)}
              align={col.align}
              active={sort.key === col.key}
              dir={sort.dir}
            />
          ))}
        </div>

        <ul>
          {rows.map((row) => (
            <PortfolioRowItem key={row.key} row={row} />
          ))}
        </ul>
      </div>
    </div>
  );
}
