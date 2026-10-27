import { describe, expect, it } from "vitest";

import {
  calendarDate,
  startOfDay,
  toCalendarDate,
  toIsoDate,
} from "~/core/calendar";

import { startsYear, timeTicks } from "./time-ticks";

const MADRID = "Europe/Madrid";
const at = (y: number, m: number, d = 1) =>
  startOfDay(calendarDate(y, m, d), MADRID).getTime();
const day = (t: number) => toIsoDate(toCalendarDate(new Date(t), MADRID));
const months = (ticks: number[]) => ticks.map((t) => day(t).slice(0, 7));

describe("timeTicks", () => {
  it("never repeats a month over a multi-year span", () => {
    const { unit, ticks } = timeTicks(at(2025, 7), at(2026, 9), MADRID);
    expect(unit).toBe("month");
    expect(new Set(months(ticks)).size).toBe(ticks.length);
  });

  it("keeps the count at or under the maximum", () => {
    const { ticks } = timeTicks(at(2019, 1), at(2026, 9), MADRID, 6);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks.length).toBeLessThanOrEqual(6);
  });

  it("anchors a quarterly step on January", () => {
    const { ticks } = timeTicks(at(2025, 2), at(2026, 1), MADRID, 6);
    expect(months(ticks)).toEqual(["2025-04", "2025-07", "2025-10", "2026-01"]);
  });

  it("widens the step rather than exceed the maximum", () => {
    const { ticks } = timeTicks(at(2025, 2), at(2026, 9), MADRID, 6);
    expect(months(ticks)).toEqual(["2025-07", "2026-01", "2026-07"]);
  });

  it("lands every tick on the first of its month, at the zone's midnight", () => {
    const { ticks } = timeTicks(at(2025, 7, 14), at(2026, 9, 3), MADRID);
    for (const tick of ticks) {
      expect(day(tick).endsWith("-01")).toBe(true);
      expect(tick).toBe(
        startOfDay(toCalendarDate(new Date(tick), MADRID), MADRID).getTime(),
      );
    }
  });

  it("switches to days on a short range", () => {
    const { unit, ticks } = timeTicks(
      at(2026, 8, 1),
      at(2026, 8, 31),
      MADRID,
      6,
    );
    expect(unit).toBe("day");
    expect(ticks.length).toBeLessThanOrEqual(6);
    expect(new Set(ticks).size).toBe(ticks.length);
  });

  it("keeps day ticks on midnight across the October switch", () => {
    const { ticks } = timeTicks(at(2026, 10, 20), at(2026, 10, 30), MADRID, 12);
    expect(ticks.map(day)).toEqual([
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
    ]);
    expect(new Date(ticks[4]!).toISOString()).toBe("2026-10-23T22:00:00.000Z");
    expect(new Date(ticks[6]!).toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });

  it("reads the month in the zone it is given, not the process's", () => {
    const newYear = Date.parse("2026-12-31T23:30:00Z");
    expect(startsYear(newYear, MADRID)).toBe(true);
    expect(startsYear(newYear, "UTC")).toBe(false);
    const { ticks } = timeTicks(
      Date.parse("2026-12-31T22:30:00Z"),
      Date.parse("2027-01-02T12:00:00Z"),
      MADRID,
    );
    expect(ticks.map((t) => new Date(t).toISOString())).toEqual([
      "2026-12-31T23:00:00.000Z",
      "2027-01-01T23:00:00.000Z",
    ]);
  });

  it("stays inside the domain", () => {
    const from = at(2025, 7, 14);
    const to = at(2026, 9, 3);
    for (const tick of timeTicks(from, to, MADRID).ticks) {
      expect(tick).toBeGreaterThanOrEqual(from);
      expect(tick).toBeLessThanOrEqual(to);
    }
  });

  it("returns nothing for an empty or inverted domain", () => {
    expect(timeTicks(at(2026, 9), at(2026, 9), MADRID).ticks).toEqual([]);
    expect(timeTicks(at(2026, 9), at(2025, 9), MADRID).ticks).toEqual([]);
  });
});
