import { afterEach, describe, expect, it, vi } from "vitest";

import { MarketDataUnavailableError } from "~/core/ports";

import { MarketDataRouter } from "../router";
import { KrakenMarketDataProvider, krakenSince } from "./provider";

const OHLC = {
  error: [],
  result: {
    "BTC/EUR": [
      [1795046400, "57421.6", "58227.9", "55965.3", "56467.6", "57163.0", "681.70258102", 26622],
      [1795132800, "56471.4", "57026.4", "52655.0", "53687.6", "54469.1", "1420.69116132", 53358],
      [1795219200, "53694.0", "53967.5", "53640.3", "53729.8", "53789.2", "116.50639245", 1711],
    ],
    last: 1795132800,
  },
};

function answer(body: unknown, status = 200) {
  const fetch = vi.fn(
    async (_url: string | URL | Request) =>
      new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const kraken = () => new KrakenMarketDataProvider({ spacingMs: 0 });

describe("KrakenMarketDataProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks for daily candles since just before the span and keeps those up to its end", async () => {
    const fetch = answer(OHLC);
    const quotes = await kraken().getHistory("BTC/EUR", {
      from: new Date("2026-11-19T00:00:00Z"),
      to: new Date("2026-11-19T12:00:00Z"),
    });

    const params = new URL(String(fetch.mock.calls[0]![0])).searchParams;
    expect(params.get("pair")).toBe("BTC/EUR");
    expect(params.get("interval")).toBe("1440");
    expect(params.get("since")).toBe(String(1795046400 - 1));
    expect(quotes.map((q) => q.price)).toEqual(["56467.6"]);
  });

  it("goes back the span of a range, and to the start for max", () => {
    const now = new Date("2026-11-21T00:00:00Z");
    expect(krakenSince("1y", now)).toBe(now.getTime() / 1000 - 365 * 86_400 - 1);
    expect(krakenSince("max", now)).toBe(0);
  });

  it("takes the last trade as today's quote", async () => {
    const fetch = answer({
      error: [],
      result: {
        "BTC/EUR": [["53736.00000", "0.05582849", 1795225211.79, "s", "l", "", 1]],
        last: "1",
      },
    });

    await expect(kraken().getQuote("BTC/EUR")).resolves.toEqual({
      symbol: "BTC/EUR",
      price: "53736",
      currency: "EUR",
      asOf: new Date("2026-11-21T01:40:11Z"),
    });
    expect(String(fetch.mock.calls[0]![0])).toContain("/Trades?pair=BTC%2FEUR&count=1");
  });

  it("answers empty for a pair Kraken does not know", async () => {
    answer({ error: ["EQuery:Unknown asset pair"] });
    await expect(kraken().getHistory("NOSUCH/EUR", "1y")).resolves.toEqual([]);
    await expect(kraken().getQuote("NOSUCH/EUR")).resolves.toBeNull();
  });

  it("throws on any other error, even with a 200", async () => {
    answer({ error: ["EGeneral:Too many requests"] });
    const error = await kraken()
      .getHistory("BTC/EUR", "1y")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MarketDataUnavailableError);
    expect((error as MarketDataUnavailableError).status).toBe(200);
  });

  it("throws on an HTTP failure, keeping the status", async () => {
    answer({}, 503);
    const error = await kraken()
      .getQuote("BTC/EUR")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MarketDataUnavailableError);
    expect((error as MarketDataUnavailableError).status).toBe(503);
  });

  it("leaves the spacing between two requests", async () => {
    answer(OHLC);
    const provider = new KrakenMarketDataProvider({ spacingMs: 60 });
    const started = Date.now();
    await provider.getHistory("BTC/EUR", "1y");
    await provider.getHistory("BTC/EUR", "1y");
    expect(Date.now() - started).toBeGreaterThanOrEqual(55);
  });
});

describe("MarketDataRouter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a pair to Kraken and anything else to Yahoo, and names the source", async () => {
    const fetch = answer(OHLC);
    const router = new MarketDataRouter(
      undefined,
      new KrakenMarketDataProvider({ spacingMs: 0 }),
    );

    await router.getHistory("BTC/EUR", "1y");
    await router.getHistory("VWCE.DE", "1y");

    expect(String(fetch.mock.calls[0]![0])).toMatch(/^https:\/\/api\.kraken\.com\//);
    expect(String(fetch.mock.calls[1]![0])).toMatch(/^https:\/\/query1\.finance\.yahoo\.com\//);
    expect(router.sourceOf("BTC/EUR")).toBe("KRAKEN");
    expect(router.sourceOf("VWCE.DE")).toBe("YAHOO");
  });
});
