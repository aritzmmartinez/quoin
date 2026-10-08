import { afterEach, describe, expect, it, vi } from "vitest";

import { HISTORY_RANGE_DAYS, type HistoryRange } from "~/core/ports";

import { historyUrl, YahooMarketDataProvider } from "./provider";

const RANGES: readonly HistoryRange[] = ["1y", "2y", "5y", "10y", "max"];
const now = new Date("2026-10-08T12:00:00.000Z");
const nowSeconds = now.getTime() / 1000;

const paramsOf = (url: string) => new URL(url).searchParams;

describe("historyUrl", () => {
  it.each(RANGES)("asks for daily candles over explicit dates for %s", (range) => {
    const params = paramsOf(historyUrl("BTC-EUR", range, now));

    expect(params.get("interval")).toBe("1d");
    expect(params.has("range")).toBe(false);
    expect(Number(params.get("period2"))).toBe(nowSeconds);
  });

  it("goes back exactly the span of each bounded range", () => {
    for (const range of ["1y", "2y", "5y", "10y"] as const) {
      const params = paramsOf(historyUrl("BTC-EUR", range, now));
      expect(Number(params.get("period1"))).toBe(
        nowSeconds - HISTORY_RANGE_DAYS[range] * 86_400,
      );
    }
  });

  it("starts the whole history at the epoch rather than asking for range=max", () => {
    expect(paramsOf(historyUrl("BTC-EUR", "max", now)).get("period1")).toBe("0");
  });
});

describe("YahooMarketDataProvider.getHistory", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(RANGES)("requests interval=1d and no range parameter for %s", async (range) => {
    const fetch = vi.fn(
      async (_url: string | URL | Request) => new Response("{}", { status: 500 }),
    );
    vi.stubGlobal("fetch", fetch);

    await new YahooMarketDataProvider().getHistory("VWCE.DE", range);

    expect(fetch).toHaveBeenCalledTimes(1);
    const params = paramsOf(String(fetch.mock.calls[0]![0]));
    expect(params.get("interval")).toBe("1d");
    expect(params.has("range")).toBe(false);
  });
});
