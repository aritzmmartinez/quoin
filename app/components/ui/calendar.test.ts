import { describe, expect, it } from "vitest";

import { addDays, addMonths, GRID_CELLS, monthGrid, monthOf } from "./calendar";

describe("monthGrid", () => {
  it("starts on the Monday of the week containing the 1st", () => {
    const grid = monthGrid("2026-07");
    expect(grid).toHaveLength(GRID_CELLS);
    expect(grid[0]).toBe("2026-06-29");
    expect(grid[2]).toBe("2026-07-01");
    expect(grid.at(-1)).toBe("2026-08-09");
  });

  it("opens on the 1st itself when the month starts on a Monday", () => {
    expect(monthGrid("2026-06")[0]).toBe("2026-06-01");
  });

  it("keeps a leap day", () => {
    expect(monthGrid("2028-02")).toContain("2028-02-29");
    expect(monthGrid("2026-02")).not.toContain("2026-02-29");
  });

  it("crosses DST boundaries without repeating or skipping a day", () => {
    for (const month of ["2026-03", "2026-10"]) {
      const grid = monthGrid(month);
      expect(new Set(grid).size).toBe(GRID_CELLS);
    }
  });
});

describe("addMonths", () => {
  it("carries the year in both directions", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-07", -18)).toBe("2025-01");
  });
});

describe("monthOf / addDays", () => {
  it("reads the month and steps days across a month end", () => {
    expect(monthOf("2026-07-14")).toBe("2026-07");
    expect(monthOf("not-a-date")).toBeNull();
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
