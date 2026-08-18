import type { RealizedSortKey } from "~/lib";

export const REALIZED_GRID =
  "grid-cols-[96px_minmax(0,1.3fr)_76px_92px_108px_84px_108px_116px_72px_68px]";
export const REALIZED_MIN_WIDTH = "min-w-[1120px]";

export interface RealizedColumnDef {
  key: RealizedSortKey;
  align: "left" | "right";
}

export const REALIZED_COLUMNS: readonly RealizedColumnDef[] = [
  { key: "date", align: "left" },
  { key: "name", align: "left" },
  { key: "quantity", align: "right" },
  { key: "price", align: "right" },
  { key: "grossAmount", align: "right" },
  { key: "fees", align: "right" },
  { key: "costBasis", align: "right" },
  { key: "realizedPnL", align: "right" },
  { key: "returnPct", align: "right" },
  { key: "holdingDays", align: "right" },
];
