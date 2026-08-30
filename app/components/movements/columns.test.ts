import { describe, expect, it } from "vitest";

import { movementColumns, movementsGrid } from "./columns";

function tracks(gridClass: string): string[] {
  const inner = /^grid-cols-\[(.+)\]$/.exec(gridClass)?.[1];
  if (inner === undefined) throw new Error(`not a grid template: ${gridClass}`);
  return inner.split("_");
}

describe("movementsGrid", () => {
  for (const showInstrument of [true, false]) {
    const label = `showInstrument=${showInstrument}`;

    it(`declares one track per rendered column (${label})`, () => {
      expect(tracks(movementsGrid(showInstrument))).toHaveLength(
        movementColumns(showInstrument).length,
      );
    });

    it(`keeps exactly one flexible track (${label})`, () => {
      const flexible = tracks(movementsGrid(showInstrument)).filter((track) =>
        track.includes("fr"),
      );
      expect(flexible).toHaveLength(1);
    });
  }
});
