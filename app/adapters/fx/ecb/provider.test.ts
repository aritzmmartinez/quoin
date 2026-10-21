import { afterEach, describe, expect, it, vi } from "vitest";

import { FxRatesUnavailableError } from "~/core/ports";

import { EcbFxRateProvider, ecbRatesUrl } from "./provider";

const HEADER =
  "KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE";
const BODY = `${HEADER}\nEXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-04-02,1.2002\n`;

const NOT_FOUND = JSON.stringify({
  type: "/service/data/EXR/D.XYZ.EUR.SP00.A",
  title: "Not Found",
  status: 404,
  detail: "No Series was returned for the query: <DataQuery/>",
  instance: "/service/data/EXR/D.XYZ.EUR.SP00.A",
});

const answer = (response: () => Response | Promise<Response>) => {
  const fetch = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) => response(),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ecbRatesUrl", () => {
  it("asks for one currency's daily reference rate against the euro, data only", () => {
    expect(ecbRatesUrl("USD", "2026-04-01", "2026-04-10")).toBe(
      "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A" +
        "?startPeriod=2026-04-01&endPeriod=2026-04-10&format=csvdata&detail=dataonly",
    );
  });
});

describe("EcbFxRateProvider", () => {
  const provider = new EcbFxRateProvider();

  it("returns the rates of a 200 with data", async () => {
    answer(() => new Response(BODY, { status: 200 }));

    await expect(
      provider.getRates("USD", "2026-04-01", "2026-04-10"),
    ).resolves.toEqual([
      {
        source: "ECB",
        base: "EUR",
        quote: "USD",
        day: "2026-04-02",
        rate: "1.2002",
      },
    ]);
  });

  it("puts a timeout on the request", async () => {
    const fetch = answer(() => new Response(BODY, { status: 200 }));

    await provider.getRates("USD", "2026-04-01", "2026-04-10");

    expect(fetch.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("answers empty for a range with no data: a 200 with no body", async () => {
    answer(() => new Response("", { status: 200 }));

    await expect(
      provider.getRates("USD", "2026-04-04", "2026-04-06"),
    ).resolves.toEqual([]);
  });

  it("answers empty for a currency the ECB does not publish", async () => {
    answer(() => new Response(NOT_FOUND, { status: 404 }));

    await expect(
      provider.getRates("XYZ", "2026-04-01", "2026-04-02"),
    ).resolves.toEqual([]);
  });

  it("never asks for a code the ECB cannot have, and answers empty", async () => {
    const fetch = answer(() => new Response(BODY, { status: 200 }));

    await expect(
      provider.getRates("USDG", "2026-04-01", "2026-04-02"),
    ).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["us", "US", "", "U.S"])(
    "throws on the malformed code %j without asking",
    async (quote) => {
      const fetch = answer(() => new Response(BODY, { status: 200 }));

      await expect(
        provider.getRates(quote, "2026-04-01", "2026-04-02"),
      ).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("throws on a malformed day without asking", async () => {
    const fetch = answer(() => new Response(BODY, { status: 200 }));

    await expect(
      provider.getRates("USD", "2026-4-1", "2026-04-02"),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws on a 404 that is not the ECB's not-found answer", async () => {
    answer(() => new Response("<html>gone</html>", { status: 404 }));

    const error = await provider
      .getRates("USD", "2026-04-01", "2026-04-02")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FxRatesUnavailableError);
    expect((error as FxRatesUnavailableError).status).toBe(404);
  });

  it.each([400, 401, 403, 429, 500, 503])(
    "throws on HTTP %i, keeping the status",
    async (status) => {
      answer(() => new Response(NOT_FOUND, { status }));

      const error = await provider
        .getRates("USD", "2026-04-01", "2026-04-02")
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(FxRatesUnavailableError);
      expect((error as FxRatesUnavailableError).status).toBe(status);
    },
  );

  it("throws on a network failure, keeping the cause", async () => {
    const cause = new TypeError("fetch failed");
    answer(() => Promise.reject(cause));

    const error = await provider
      .getRates("USD", "2026-04-01", "2026-04-02")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FxRatesUnavailableError);
    expect((error as FxRatesUnavailableError).status).toBeNull();
    expect((error as FxRatesUnavailableError).cause).toBe(cause);
  });

  it("throws on a 200 whose body is not the CSV it measured", async () => {
    answer(() => new Response("KEY,OBS_VALUE\nX,1.2\n", { status: 200 }));

    await expect(
      provider.getRates("USD", "2026-04-01", "2026-04-02"),
    ).rejects.toBeInstanceOf(FxRatesUnavailableError);
  });
});
