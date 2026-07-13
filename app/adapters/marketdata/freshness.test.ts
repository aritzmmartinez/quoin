import { describe, expect, it } from "vitest";

import { isFreshQuote, MAX_QUOTE_AGE_MS } from "./freshness";

const now = new Date("2026-07-13T12:00:00.000Z");

describe("isFreshQuote", () => {
  it("accepts a quote from today", () => {
    expect(
      isFreshQuote({ asOf: new Date("2026-07-13T09:00:00.000Z") }, now),
    ).toBe(true);
  });

  it("accepts a quote a few days old (weekend/holiday)", () => {
    expect(
      isFreshQuote({ asOf: new Date("2026-07-10T15:36:00.000Z") }, now),
    ).toBe(true);
  });

  it("rejects an ancient quote (e.g. a 2021 candle)", () => {
    expect(
      isFreshQuote({ asOf: new Date("2021-04-30T15:36:00.000Z") }, now),
    ).toBe(false);
  });

  it("rejects anything older than the max age boundary", () => {
    const tooOld = new Date(now.getTime() - MAX_QUOTE_AGE_MS - 1);
    expect(isFreshQuote({ asOf: tooOld }, now)).toBe(false);
  });

  it("tolerates a slightly future timestamp (clock skew)", () => {
    expect(
      isFreshQuote({ asOf: new Date("2026-07-13T12:05:00.000Z") }, now),
    ).toBe(true);
  });
});
