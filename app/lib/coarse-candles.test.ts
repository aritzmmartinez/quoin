import { describe, expect, it } from "vitest";

import { isCoarseSeries } from "./coarse-candles";

const DAY = 86_400_000;
const start = Date.UTC(2024, 0, 1, 7);

function series(...stepsInDays: number[]): Date[] {
  const times = [new Date(start)];
  for (const step of stepsInDays) {
    times.push(new Date(times[times.length - 1]!.getTime() + step * DAY));
  }
  return times;
}

const weekdays = (weeks: number) =>
  Array.from({ length: weeks }, () => [1, 1, 1, 1, 3]).flat();

describe("isCoarseSeries", () => {
  it("leaves a daily series alone, weekends and holidays included", () => {
    expect(isCoarseSeries(series(...weekdays(52), 5, ...weekdays(10)))).toBe(
      false,
    );
  });

  it("leaves a 24/7 daily series alone", () => {
    expect(isCoarseSeries(series(...Array<number>(400).fill(1)))).toBe(false);
  });

  it("flags a monthly series", () => {
    expect(isCoarseSeries(series(31, 29, 31, 30, 31, 30, 31))).toBe(true);
  });

  it("flags a weekly series", () => {
    expect(isCoarseSeries(series(...Array<number>(20).fill(7)))).toBe(true);
  });

  it("flags a mixed series: monthly years before a long daily stretch", () => {
    const monthly = Array<number>(24).fill(30);
    const daily = Array<number>(1800).fill(1);
    expect(isCoarseSeries(series(...monthly, ...daily))).toBe(true);
  });

  it("flags a weekly head before a daily tail", () => {
    expect(isCoarseSeries(series(7, 7, 7, ...weekdays(200)))).toBe(true);
  });

  it("tolerates an isolated long gap in an illiquid daily series", () => {
    expect(isCoarseSeries(series(...weekdays(20), 8, ...weekdays(20), 6))).toBe(
      false,
    );
  });

  it("does not depend on the input order", () => {
    expect(isCoarseSeries(series(31, 29, 31, 30).reverse())).toBe(true);
  });

  it("says nothing about a series too short to measure", () => {
    expect(isCoarseSeries([])).toBe(false);
    expect(isCoarseSeries(series(30, 30))).toBe(false);
  });
});
