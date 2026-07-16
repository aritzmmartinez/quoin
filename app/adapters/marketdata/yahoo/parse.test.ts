import { describe, expect, it } from "vitest";

import { parseYahooChart, parseYahooChartHistory } from "./parse";

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

describe("parseYahooChartHistory", () => {
  const history = (
    timestamp: (number | null)[],
    close: (number | null)[],
    currency = "EUR",
  ) => ({
    chart: {
      result: [
        {
          meta: { currency },
          timestamp,
          indicators: { quote: [{ close }] },
        },
      ],
    },
  });

  it("pairs timestamps with closes, oldest first", () => {
    const quotes = parseYahooChartHistory(
      history([1_700_000_000, 1_700_086_400], [10.5, 11]),
      "VWCE.DE",
    );

    expect(quotes).toHaveLength(2);
    expect(quotes[0]).toEqual({
      symbol: "VWCE.DE",
      price: "10.500000",
      currency: "EUR",
      asOf: new Date(1_700_000_000 * 1000),
    });
    expect(quotes[1]?.price).toBe("11.000000");
  });

  it("drops sessions with no close instead of interpolating", () => {
    const quotes = parseYahooChartHistory(
      history([1, 2, 3], [10, null, 12]),
      "VWCE.DE",
    );

    expect(quotes.map((q) => q.price)).toEqual(["10.000000", "12.000000"]);
  });

  it("sorts an out-of-order payload", () => {
    const quotes = parseYahooChartHistory(
      history([3, 1, 2], [12, 10, 11]),
      "X",
    );

    expect(quotes.map((q) => q.asOf.getTime())).toEqual([1000, 2000, 3000]);
  });

  it("trusts the arrays only as far as the shorter one", () => {
    const quotes = parseYahooChartHistory(history([1, 2, 3], [10]), "X");

    expect(quotes).toHaveLength(1);
  });

  it("returns nothing without a currency or a usable payload", () => {
    const noCurrency = {
      chart: {
        result: [
          {
            meta: {},
            timestamp: [1],
            indicators: { quote: [{ close: [10] }] },
          },
        ],
      },
    };
    expect(parseYahooChartHistory(noCurrency, "X")).toEqual([]);
    expect(parseYahooChartHistory({ chart: { result: [] } }, "X")).toEqual([]);
    expect(parseYahooChartHistory(null, "X")).toEqual([]);
  });
});
