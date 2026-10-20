import { describe, it, expect } from "vitest";

import { atOrBefore, lastOnOrBefore, onOrBeforeDay } from "./as-of";

const DAY_MS = 86_400_000;

interface Point {
  t: number;
  label: string;
}

const at = (t: number, label = String(t)): Point => ({ t, label });
const timeOf = (p: Point) => p.t;

describe("lastOnOrBefore", () => {
  const series = [at(10), at(20), at(30)];

  it("returns the item on the key itself", () => {
    expect(lastOnOrBefore(series, timeOf, 20, null)).toEqual(at(20));
  });

  it("returns the last item before the key", () => {
    expect(lastOnOrBefore(series, timeOf, 29, null)).toEqual(at(20));
  });

  it("never reaches forward", () => {
    expect(lastOnOrBefore(series, timeOf, 9, null)).toBeNull();
  });

  it("returns null on an empty series", () => {
    expect(lastOnOrBefore([], timeOf, 20, null)).toBeNull();
  });

  it("has no age limit without an earliest key", () => {
    expect(lastOnOrBefore(series, timeOf, 1_000_000, null)).toEqual(at(30));
  });

  it("accepts an item exactly on the earliest key and refuses one before it", () => {
    expect(lastOnOrBefore(series, timeOf, 25, 20)).toEqual(at(20));
    expect(lastOnOrBefore(series, timeOf, 25, 21)).toBeNull();
  });

  it("returns the last of several items sharing a key", () => {
    const repeated = [at(10, "a"), at(20, "b"), at(20, "c"), at(20, "d")];
    expect(lastOnOrBefore(repeated, timeOf, 20, null)?.label).toBe("d");
    expect(lastOnOrBefore(repeated, timeOf, 25, null)?.label).toBe("d");
  });

  it("finds the answer on every key of a long series", () => {
    const long = Array.from({ length: 101 }, (_, i) => at(i * 2));
    for (let key = -1; key <= 201; key += 1) {
      const expected = long.filter((p) => p.t <= key).at(-1) ?? null;
      expect(lastOnOrBefore(long, timeOf, key, null)).toEqual(expected);
    }
  });
});

describe("atOrBefore", () => {
  const close = at(Date.UTC(2026, 0, 1));
  const series = [close];

  it("accepts an item exactly the maximum age old", () => {
    expect(atOrBefore(series, timeOf, close.t + 7 * DAY_MS, 7 * DAY_MS)).toBe(
      close,
    );
  });

  it("refuses an item one millisecond older than the maximum age", () => {
    expect(
      atOrBefore(series, timeOf, close.t + 7 * DAY_MS + 1, 7 * DAY_MS),
    ).toBeNull();
  });

  it("has no age limit when none is given", () => {
    expect(atOrBefore(series, timeOf, close.t + 365 * DAY_MS, null)).toBe(
      close,
    );
  });
});

describe("onOrBeforeDay", () => {
  interface Close {
    day: string;
  }
  const dayOf = (c: Close) => c.day;
  const series: Close[] = [
    { day: "2025-12-24" },
    { day: "2025-12-31" },
    { day: "2026-02-27" },
  ];

  it("counts the age in calendar days across a year boundary", () => {
    expect(onOrBeforeDay(series, dayOf, "2026-01-07", 7)).toEqual({
      day: "2025-12-31",
    });
    expect(onOrBeforeDay(series, dayOf, "2026-01-08", 7)).toBeNull();
  });

  it("counts the age in calendar days across the end of February", () => {
    expect(onOrBeforeDay(series, dayOf, "2026-03-06", 7)).toEqual({
      day: "2026-02-27",
    });
    expect(onOrBeforeDay(series, dayOf, "2026-03-07", 7)).toBeNull();
  });

  it("takes the item on the same day", () => {
    expect(onOrBeforeDay(series, dayOf, "2025-12-31", 7)).toEqual({
      day: "2025-12-31",
    });
  });

  it("has no age limit when none is given", () => {
    expect(onOrBeforeDay(series, dayOf, "2030-01-01", null)).toEqual({
      day: "2026-02-27",
    });
  });
});
