import { describe, expect, it } from "vitest";

import type { FxRate, PriceSnapshot } from "../ports";
import { rateBookFrom } from "./rates";
import { historyInBase, pricesInBase } from "./value";

const usd = (day: string, rate: string): FxRate => ({
  source: "ECB",
  base: "EUR",
  quote: "USD",
  day,
  rate,
});

const BOOK = rateBookFrom([usd("2026-04-02", "1.25"), usd("2026-04-07", "1.6")]);

const snapshot = (
  asOf: string,
  price: string,
  currency = "USD",
): PriceSnapshot => ({
  instrumentId: "US00TEST0001",
  price,
  currency,
  asOf: new Date(asOf),
  source: "YAHOO",
});

describe("pricesInBase", () => {
  it("converts a price in another currency at the last rate published", () => {
    const { prices, unrated } = pricesInBase(
      new Map([["US00TEST0001", snapshot("2026-04-07T20:00:00Z", "160")]]),
      BOOK,
      new Date("2026-04-08T09:00:00Z"),
    );
    expect(prices.get("US00TEST0001")).toMatchObject({
      price: "100",
      currency: "EUR",
    });
    expect(unrated.size).toBe(0);
  });

  it("values at today's rate, not at the rate of the price's own day", () => {
    const { prices } = pricesInBase(
      new Map([["US00TEST0001", snapshot("2026-04-02T20:00:00Z", "160")]]),
      BOOK,
      new Date("2026-04-08T09:00:00Z"),
    );
    expect(prices.get("US00TEST0001")?.price).toBe("100");
  });

  it("leaves a price in euros exactly as it is", () => {
    const eur = snapshot("2026-04-07T20:00:00Z", "12.345", "EUR");
    const { prices } = pricesInBase(
      new Map([["IE00TEST0001", eur]]),
      BOOK,
      new Date("2026-04-08T09:00:00Z"),
    );
    expect(prices.get("IE00TEST0001")).toBe(eur);
  });

  it("sets aside a price whose currency has no recent rate, naming the currency", () => {
    const { prices, unrated } = pricesInBase(
      new Map([
        ["US00TEST0001", snapshot("2026-04-07T20:00:00Z", "160")],
        ["GB00TEST0001", snapshot("2026-04-07T20:00:00Z", "5", "GBP")],
      ]),
      BOOK,
      new Date("2026-04-20T09:00:00Z"),
    );
    expect(prices.size).toBe(0);
    expect(unrated).toEqual(
      new Map([
        ["US00TEST0001", "USD"],
        ["GB00TEST0001", "GBP"],
      ]),
    );
  });
});

describe("historyInBase", () => {
  it("converts each close at the rate of its own day", () => {
    const { history, unrated } = historyInBase(
      [
        snapshot("2026-04-02T20:00:00Z", "125"),
        snapshot("2026-04-03T20:00:00Z", "250"),
        snapshot("2026-04-07T20:00:00Z", "160"),
      ],
      BOOK,
    );
    expect(history.map((s) => s.price)).toEqual(["100", "200", "100"]);
    expect(history.every((s) => s.currency === "EUR")).toBe(true);
    expect(unrated).toBe(0);
  });

  it("drops a close with no rate within a week, and counts it", () => {
    const { history, unrated } = historyInBase(
      [
        snapshot("2026-03-30T20:00:00Z", "100"),
        snapshot("2026-04-02T20:00:00Z", "125"),
      ],
      BOOK,
    );
    expect(history.map((s) => s.price)).toEqual(["100"]);
    expect(unrated).toBe(1);
  });

  it("dates a close by its Madrid day", () => {
    const { history } = historyInBase(
      [snapshot("2026-04-06T22:30:00Z", "160")],
      BOOK,
    );
    expect(history[0]?.price).toBe("100");
  });
});
