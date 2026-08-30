export type MovementColumnKey =
  | "date"
  | "type"
  | "instrument"
  | "quantity"
  | "price"
  | "costs"
  | "amount";

export interface MovementColumnDef {
  key: MovementColumnKey;
  align: "left" | "right";
}

const ALL_COLUMNS: readonly MovementColumnDef[] = [
  { key: "date", align: "left" },
  { key: "type", align: "left" },
  { key: "instrument", align: "left" },
  { key: "quantity", align: "right" },
  { key: "price", align: "right" },
  { key: "costs", align: "right" },
  { key: "amount", align: "right" },
];

export function movementColumns(showInstrument: boolean): MovementColumnDef[] {
  return ALL_COLUMNS.filter((c) => showInstrument || c.key !== "instrument");
}

export function movementsGrid(showInstrument: boolean): string {
  return showInstrument
    ? "grid-cols-[104px_84px_minmax(0,1.4fr)_96px_104px_92px_128px]"
    : "grid-cols-[104px_minmax(84px,1fr)_96px_104px_92px_128px]";
}

export function movementsMinWidth(showInstrument: boolean): string {
  return showInstrument ? "min-w-[840px]" : "min-w-[688px]";
}
