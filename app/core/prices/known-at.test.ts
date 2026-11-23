import { describe, expect, it } from "vitest";

import { candleKnownAt, snapshotKnownAt } from "./known-at";

describe("when a stored price became information", () => {
  it("a daily candle once its day has closed", () => {
    expect(new Date(candleKnownAt(new Date("2025-11-25T00:00:00Z")))).toEqual(
      new Date("2025-11-26T00:00:00Z"),
    );
    expect(
      new Date(
        snapshotKnownAt({
          asOf: new Date("2025-11-25T07:00:00Z"),
          source: "YAHOO",
        }),
      ),
    ).toEqual(new Date("2025-11-26T07:00:00Z"));
  });

  it("a live quote at its own market time", () => {
    expect(
      new Date(
        snapshotKnownAt({
          asOf: new Date("2025-11-25T14:00:00Z"),
          source: "YAHOO_LIVE",
        }),
      ),
    ).toEqual(new Date("2025-11-25T14:00:00Z"));
  });

  it("the same for Kraken's candle and live trade", () => {
    expect(
      snapshotKnownAt({
        asOf: new Date("2026-11-20T00:00:00Z"),
        source: "KRAKEN",
      }),
    ).toBe(new Date("2026-11-21T00:00:00Z").getTime());
    expect(
      snapshotKnownAt({
        asOf: new Date("2026-11-21T01:40:11Z"),
        source: "KRAKEN_LIVE",
      }),
    ).toBe(new Date("2026-11-21T01:40:11Z").getTime());
  });
});
