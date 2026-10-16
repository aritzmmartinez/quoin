import { describe, expect, it } from "vitest";

import {
  DEFAULT_RANGE,
  filterByRange,
  parseRange,
  rangedSeries,
} from "./range";

describe("parseRange", () => {
  it("reads a valid range from the URL", () => {
    expect(parseRange(new URLSearchParams("range=6m"))).toBe("6m");
  });

  it("falls back to the default when missing or unrecognized", () => {
    expect(parseRange(new URLSearchParams(""))).toBe(DEFAULT_RANGE);
    expect(parseRange(new URLSearchParams("range=nonsense"))).toBe(
      DEFAULT_RANGE,
    );
  });
});

describe("filterByRange", () => {
  const now = new Date("2026-07-15T00:00:00Z");
  const day = 24 * 60 * 60 * 1000;
  const data = [
    { t: now.getTime() - 400 * day },
    { t: now.getTime() - 200 * day },
    { t: now.getTime() - 10 * day },
  ];

  it("keeps everything for the all range", () => {
    expect(filterByRange(data, "all", now)).toHaveLength(3);
  });

  it("cuts points older than the window", () => {
    expect(filterByRange(data, "1y", now)).toHaveLength(2);
    expect(filterByRange(data, "6m", now)).toHaveLength(1);
    expect(filterByRange(data, "1m", now)).toHaveLength(1);
  });

  it("does not mutate the input", () => {
    const input = [...data];
    filterByRange(input, "1m", now);
    expect(input).toHaveLength(3);
  });
});

describe("rangedSeries", () => {
  const now = new Date("2026-07-15T00:00:00Z");
  const day = 24 * 60 * 60 * 1000;
  const stale = [
    { t: now.getTime() - 300 * day },
    { t: now.getTime() - 200 * day },
    { t: now.getTime() - 90 * day },
  ];

  it("judges the filtered view, not the whole series", () => {
    expect(rangedSeries(stale, "1m", 1, now)).toEqual({ kind: "outOfRange" });
    expect(rangedSeries(stale, "1m", 2, now)).toEqual({ kind: "outOfRange" });
  });

  it("refuses a view with fewer points than the chart needs", () => {
    expect(rangedSeries(stale, "6m", 1, now)).toEqual({
      kind: "ready",
      points: [stale[2]],
    });
    expect(rangedSeries(stale, "6m", 2, now)).toEqual({ kind: "outOfRange" });
  });

  it("reports a series too short to draw as empty, whatever the range", () => {
    expect(rangedSeries([], "all", 1, now)).toEqual({ kind: "empty" });
    expect(rangedSeries(stale.slice(0, 1), "1m", 2, now)).toEqual({
      kind: "empty",
    });
  });

  it("returns the filtered points when the view is drawable", () => {
    expect(rangedSeries(stale, "1y", 2, now)).toEqual({
      kind: "ready",
      points: stale,
    });
  });
});
