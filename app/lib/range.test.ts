import { describe, expect, it } from "vitest";

import { DEFAULT_RANGE, filterByRange, parseRange } from "./range";

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
