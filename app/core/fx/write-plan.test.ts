import { describe, it, expect } from "vitest";

import type { FxRate, FxSeries } from "../ports";
import { planFxWrite } from "./write-plan";

const SERIES: FxSeries = { source: "ECB", base: "EUR", quote: "USD" };

const rate = (day: string, value: string, over: Partial<FxRate> = {}) => ({
  ...SERIES,
  day,
  rate: value,
  ...over,
});

describe("planFxWrite", () => {
  it("inserts the days not stored yet, oldest first", () => {
    const plan = planFxWrite(
      SERIES,
      [rate("2026-04-01", "1.0800")],
      [rate("2026-04-07", "1.0900"), rate("2026-04-02", "1.0850")],
    );

    expect(plan.write.map((r) => r.day)).toEqual(["2026-04-02", "2026-04-07"]);
    expect(plan.inserted).toBe(2);
    expect(plan.unchanged).toBe(0);
    expect(plan.conflicts).toEqual([]);
  });

  it("counts a day already stored at the same rate as unchanged, however written", () => {
    const plan = planFxWrite(
      SERIES,
      [rate("2026-04-01", "1.08")],
      [rate("2026-04-01", "1.0800")],
    );

    expect(plan).toEqual({
      write: [],
      inserted: 0,
      unchanged: 1,
      conflicts: [],
    });
  });

  it("refuses the whole batch when a stored day arrives with another rate", () => {
    const stored = rate("2026-04-01", "1.0800");
    const revised = rate("2026-04-01", "1.0810");
    const plan = planFxWrite(
      SERIES,
      [stored],
      [revised, rate("2026-04-02", "1.0850")],
    );

    expect(plan.write).toEqual([]);
    expect(plan.inserted).toBe(0);
    expect(plan.conflicts).toEqual([{ stored, incoming: revised }]);
  });

  it("refuses a batch that disagrees with itself about one day", () => {
    const first = rate("2026-04-02", "1.0850");
    const second = rate("2026-04-02", "1.0860");
    const plan = planFxWrite(SERIES, [], [first, second]);

    expect(plan.write).toEqual([]);
    expect(plan.conflicts).toEqual([{ stored: first, incoming: second }]);
  });

  it("throws on a rate from another series instead of filing it here", () => {
    expect(() =>
      planFxWrite(SERIES, [], [rate("2026-04-02", "0.85", { quote: "GBP" })]),
    ).toThrow(/does not belong/);
  });
});
