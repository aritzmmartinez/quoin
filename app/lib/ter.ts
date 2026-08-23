import Decimal from "decimal.js";

import type { Instrument } from "~/core/domain";
import type { TerLine } from "~/core/projections";

export interface TerRow {
  instrumentId: string;
  name: string;
  value: string;
  ter: string | null;
  annualCost: string | null;
}

export function toTerRows(
  lines: readonly TerLine[],
  instruments: readonly Instrument[],
): TerRow[] {
  const byId = new Map(instruments.map((i) => [i.id, i]));

  return lines
    .filter((line) => new Decimal(line.value).gt(0))
    .map((line) => {
      const ter = line.ter == null || line.ter === "" ? null : line.ter;
      return {
        instrumentId: line.instrumentId,
        name: byId.get(line.instrumentId)?.name ?? line.instrumentId,
        value: line.value,
        ter,
        annualCost:
          ter === null ? null : new Decimal(line.value).times(ter).toFixed(2),
      };
    })
    .sort((a, b) => {
      if (a.annualCost === null && b.annualCost === null) {
        return a.name.localeCompare(b.name, "es");
      }
      if (a.annualCost === null) return 1;
      if (b.annualCost === null) return -1;
      return new Decimal(b.annualCost).comparedTo(a.annualCost);
    });
}

export function terToPercentInput(ter: string | null | undefined): string {
  if (ter == null || ter === "") return "";
  return new Decimal(ter).times(100).toString().replace(".", ",");
}
