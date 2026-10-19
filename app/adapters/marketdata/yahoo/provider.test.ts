import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HISTORY_RANGE_DAYS,
  MarketDataUnavailableError,
  type HistoryRange,
} from "~/core/ports";

import { historyUrl, YahooMarketDataProvider } from "./provider";

const RANGES: readonly HistoryRange[] = ["1y", "2y", "5y", "10y", "max"];
const now = new Date("2026-10-08T12:00:00.000Z");
const nowSeconds = now.getTime() / 1000;

const paramsOf = (url: string) => new URL(url).searchParams;

describe("historyUrl", () => {
  it.each(RANGES)(
    "asks for daily candles over explicit dates for %s",
    (range) => {
      const params = paramsOf(historyUrl("BTC-EUR", range, now));

      expect(params.get("interval")).toBe("1d");
      expect(params.has("range")).toBe(false);
      expect(Number(params.get("period2"))).toBe(nowSeconds);
    },
  );

  it("goes back exactly the span of each bounded range", () => {
    for (const range of ["1y", "2y", "5y", "10y"] as const) {
      const params = paramsOf(historyUrl("BTC-EUR", range, now));
      expect(Number(params.get("period1"))).toBe(
        nowSeconds - HISTORY_RANGE_DAYS[range] * 86_400,
      );
    }
  });

  it("asks only for the dates of an explicit span", () => {
    const from = new Date("2025-07-24T10:00:00.000Z");
    const to = new Date("2025-08-01T10:00:00.000Z");
    const params = paramsOf(historyUrl("BTC-EUR", { from, to }, now));

    expect(params.get("interval")).toBe("1d");
    expect(Number(params.get("period1"))).toBe(from.getTime() / 1000);
    expect(Number(params.get("period2"))).toBe(to.getTime() / 1000);
  });

  it("starts the whole history at the epoch rather than asking for range=max", () => {
    expect(paramsOf(historyUrl("BTC-EUR", "max", now)).get("period1")).toBe(
      "0",
    );
  });
});

describe("YahooMarketDataProvider.getHistory", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(RANGES)(
    "requests interval=1d and no range parameter for %s",
    async (range) => {
      const fetch = vi.fn(
        async (_url: string | URL | Request) =>
          new Response("{}", { status: 200 }),
      );
      vi.stubGlobal("fetch", fetch);

      await new YahooMarketDataProvider().getHistory("VWCE.DE", range);

      expect(fetch).toHaveBeenCalledTimes(1);
      const params = paramsOf(String(fetch.mock.calls[0]![0]));
      expect(params.get("interval")).toBe("1d");
      expect(params.has("range")).toBe(false);
    },
  );
});

describe("YahooMarketDataProvider failures", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const answer = (response: () => Response | Promise<Response>) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );

  const NOT_FOUND = JSON.stringify({
    chart: {
      result: null,
      error: {
        code: "Not Found",
        description: "No data found, symbol may be delisted",
      },
    },
  });

  it("answers empty for a symbol Yahoo does not know", async () => {
    answer(() => new Response(NOT_FOUND, { status: 404 }));
    const provider = new YahooMarketDataProvider();

    await expect(provider.getQuote("NOPE.DE")).resolves.toBeNull();
    await expect(provider.getHistory("NOPE.DE", "1y")).resolves.toEqual([]);
  });

  it("answers empty for a known symbol with no daily candles", async () => {
    // What an <ISIN>.SG line returns: a 200 with meta and no timestamps.
    answer(
      () =>
        new Response(
          JSON.stringify({
            chart: {
              result: [{ meta: { currency: "EUR" }, indicators: {} }],
              error: null,
            },
          }),
          { status: 200 },
        ),
    );

    await expect(
      new YahooMarketDataProvider().getHistory("XS00TEST0001.SG", "1y"),
    ).resolves.toEqual([]);
  });

  it.each([400, 401, 403, 429, 500, 503])(
    "throws on HTTP %i, keeping the status",
    async (status) => {
      answer(() => new Response("{}", { status }));
      const provider = new YahooMarketDataProvider();

      for (const call of [
        () => provider.getQuote("VWCE.DE"),
        () => provider.getHistory("VWCE.DE", "1y"),
      ]) {
        const error = await call().catch((e: unknown) => e);
        expect(error).toBeInstanceOf(MarketDataUnavailableError);
        expect((error as MarketDataUnavailableError).status).toBe(status);
      }
    },
  );

  it("throws on a network failure, keeping the cause", async () => {
    const cause = new TypeError("fetch failed");
    answer(() => Promise.reject(cause));

    const error = await new YahooMarketDataProvider()
      .getHistory("VWCE.DE", "1y")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MarketDataUnavailableError);
    expect((error as MarketDataUnavailableError).status).toBeNull();
    expect((error as MarketDataUnavailableError).cause).toBe(cause);
  });

  it("throws on a 200 that is not JSON", async () => {
    answer(() => new Response("<html>", { status: 200 }));

    await expect(
      new YahooMarketDataProvider().getQuote("VWCE.DE"),
    ).rejects.toBeInstanceOf(MarketDataUnavailableError);
  });
});
