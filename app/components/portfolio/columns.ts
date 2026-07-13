import type { SortKey } from "~/lib";

/**
 * Single grid template shared by the header and every row so columns stay
 * pixel-aligned:
 * Chevron | Instrumento | Tipo | Cantidad | Precio medio | Aportado | Valor | P&L | Peso.
 *
 * The table scrolls horizontally, so this wide layout stays usable on narrow
 * viewports. P&L here is *unrealized* (value − invested); realized P&L lives in
 * the expandable detail.
 */
export const GRID_TEMPLATE =
  "grid-cols-[32px_minmax(0,1.7fr)_88px_100px_108px_116px_116px_116px_88px]";
export const TABLE_MIN_WIDTH = "min-w-[940px]";

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
  { key: "marketValue", align: "right" },
  { key: "unrealizedPnL", align: "right" },
  { key: "weight", align: "right" },
];
