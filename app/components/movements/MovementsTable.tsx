import { Link } from "react-router";

import {
  DASH,
  es,
  formatDate,
  formatMoney,
  formatQuantity,
  type MovementRow,
  type PageInfo,
} from "~/lib";

import { Pagination } from "../ui/Pagination";
import { TABLE_HEAD, TABLE_NUM, TABLE_ROW, TABLE_SCROLL } from "../ui/table";
import {
  movementColumns,
  movementsGrid,
  movementsMinWidth,
  type MovementColumnDef,
  type MovementColumnKey,
} from "./columns";

const TYPE_TONE: Partial<Record<MovementRow["type"], string>> = {
  BUY: "text-positive",
  SELL: "text-negative",
};

function cellClass(col: MovementColumnDef): string {
  if (col.align === "right") return `${TABLE_NUM} text-right`;
  if (col.key === "date") return "truncate font-mono";
  return "truncate";
}

export function MovementsTable({
  rows,
  info,
  showInstrument = true,
}: {
  rows: MovementRow[];
  info: PageInfo;
  showInstrument?: boolean;
}) {
  const copy = es.movements;
  const columns = movementColumns(showInstrument);
  const grid = movementsGrid(showInstrument);

  if (rows.length === 0) {
    return (
      <p className="px-gutter pb-6 pt-2 text-[13px] text-muted">{copy.empty}</p>
    );
  }

  return (
    <>
      <div className={TABLE_SCROLL}>
        <div className={movementsMinWidth(showInstrument)}>
          <div role="row" className={`${TABLE_HEAD} ${grid}`}>
            {columns.map((col) => (
              <span
                key={col.key}
                className={col.align === "right" ? "text-right" : undefined}
              >
                {copy.columns[col.key]}
              </span>
            ))}
          </div>

          <ul>
            {rows.map((row) => (
              <li
                key={row.id}
                className={`${TABLE_ROW} ${grid} min-h-11 text-[13px]`}
              >
                {columns.map((col) => (
                  <span key={col.key} className={cellClass(col)}>
                    <Cell row={row} column={col.key} />
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Pagination info={info} />
    </>
  );
}

function Cell({
  row,
  column,
}: {
  row: MovementRow;
  column: MovementColumnKey;
}) {
  switch (column) {
    case "date":
      return <>{formatDate(row.t)}</>;

    case "type":
      return (
        <span className={TYPE_TONE[row.type]}>
          {es.movements.types[row.type]}
        </span>
      );

    case "instrument":
      return row.instrumentId === null ? (
        <span className="text-muted">{DASH}</span>
      ) : (
        <Link
          to={`/instrument/${row.instrumentId}`}
          className="transition-colors hover:text-text hover:underline"
        >
          {row.instrumentName}
        </Link>
      );

    case "quantity":
      return <>{row.quantity === null ? DASH : formatQuantity(row.quantity)}</>;

    case "price":
      return <>{row.price === null ? DASH : formatMoney(row.price)}</>;

    case "costs":
      return (
        <span className="text-muted">
          {Number(row.costs) === 0 ? DASH : formatMoney(row.costs)}
        </span>
      );

    case "amount":
      return <span className="font-medium">{formatMoney(row.amount)}</span>;
  }
}
