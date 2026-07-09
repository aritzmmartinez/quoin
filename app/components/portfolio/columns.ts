import type { SortKey } from "~/lib";

export const GRID_TEMPLATE =
  "grid-cols-[32px_minmax(0,1.7fr)_90px_110px_120px_130px_120px]";
export const TABLE_MIN_WIDTH = "min-w-[780px]";

export interface ColumnDef {
  key: SortKey;
  align: "left" | "right";
}

export const COLUMNS: ColumnDef[] = [
  { key: "name", align: "left" },
  { key: "type", align: "left" },
  { key: "quantity", align: "right" },
  { key: "averageCost", align: "right" },
  { key: "costBasis", align: "right" },
  { key: "realizedPnL", align: "right" },
];
