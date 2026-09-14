import { describe, expect, it } from "vitest";

import { timeTicks } from "./time-ticks";

const at = (y: number, m: number, d = 1) => new Date(y, m - 1, d).getTime();
const months = (ticks: number[]) =>
  ticks.map((t) => {
    const date = new Date(t);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });

describe("timeTicks", () => {
  it("never repeats a month over a multi-year span", () => {
    const { unit, ticks } = timeTicks(at(2025, 7), at(2026, 9));
    expect(unit).toBe("month");
    expect(new Set(months(ticks)).size).toBe(ticks.length);
  });

  it("keeps the count at or under the maximum", () => {
    const { ticks } = timeTicks(at(2019, 1), at(2026, 9), 6);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks.length).toBeLessThanOrEqual(6);
  });

  it("anchors a quarterly step on January", () => {
    const { ticks } = timeTicks(at(2025, 2), at(2026, 1), 6);
    expect(months(ticks)).toEqual(["2025-04", "2025-07", "2025-10", "2026-01"]);
  });

  it("widens the step rather than exceed the maximum", () => {
    const { ticks } = timeTicks(at(2025, 2), at(2026, 9), 6);
    expect(months(ticks)).toEqual(["2025-07", "2026-01", "2026-07"]);
  });

  it("lands every tick on the first of its month", () => {
    const { ticks } = timeTicks(at(2025, 7, 14), at(2026, 9, 3));
    for (const tick of ticks) {
      const date = new Date(tick);
      expect(date.getDate()).toBe(1);
      expect(date.getHours()).toBe(0);
    }
  });

  it("switches to days on a short range", () => {
    const { unit, ticks } = timeTicks(at(2026, 8, 1), at(2026, 8, 31), 6);
    expect(unit).toBe("day");
    expect(ticks.length).toBeLessThanOrEqual(6);
    expect(new Set(ticks).size).toBe(ticks.length);
  });

  it("stays inside the domain", () => {
    const from = at(2025, 7, 14);
    const to = at(2026, 9, 3);
    for (const tick of timeTicks(from, to).ticks) {
      expect(tick).toBeGreaterThanOrEqual(from);
      expect(tick).toBeLessThanOrEqual(to);
    }
  });

  it("returns nothing for an empty or inverted domain", () => {
    expect(timeTicks(at(2026, 9), at(2026, 9)).ticks).toEqual([]);
    expect(timeTicks(at(2026, 9), at(2025, 9)).ticks).toEqual([]);
  });
});
