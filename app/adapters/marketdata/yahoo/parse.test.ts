import { describe, expect, it } from "vitest";

import { parseYahooChart } from "./parse";

const sample = {
  chart: {
    result: [
      {
        meta: {
          currency: "EUR",
          symbol: "VWCE.DE",
          regularMarketPrice: 118.42,
          regularMarketTime: 1_751_363_100,
        },
      },
    ],
    error: null,
  },
};

describe("parseYahooChart", () => {
  it("extracts price, currency and timestamp", () => {
    const quote = parseYahooChart(sample, "VWCE.DE");
    expect(quote).not.toBeNull();
    expect(quote?.symbol).toBe("VWCE.DE");
    expect(quote?.currency).toBe("EUR");
    expect(quote?.price).toBe("118.420000");
    expect(quote?.asOf).toEqual(new Date(1_751_363_100 * 1000));
  });

  it("returns null on a provider error / empty result", () => {
    expect(
      parseYahooChart({ chart: { result: null, error: "Not Found" } }, "NOPE"),
    ).toBeNull();
    expect(parseYahooChart({}, "NOPE")).toBeNull();
    expect(parseYahooChart(null, "NOPE")).toBeNull();
  });

  it("returns null when the price field is missing or not finite", () => {
    const noPrice = {
      chart: { result: [{ meta: { currency: "EUR", regularMarketTime: 1 } }] },
    };
    expect(parseYahooChart(noPrice, "X")).toBeNull();
    const nan = {
      chart: {
        result: [
          {
            meta: {
              currency: "EUR",
              regularMarketPrice: NaN,
              regularMarketTime: 1,
            },
          },
        ],
      },
    };
    expect(parseYahooChart(nan, "X")).toBeNull();
  });
});
