import { afterEach, describe, expect, it, vi } from "vitest";

import { InflationUnavailableError } from "~/core/ports";

import { INE_TIMEOUT_MS, IneInflationProvider } from "./provider";

const answer = (response: () => Response | Promise<Response>) => {
  const fetch = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) => response(),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

const baseYear = (year: number) =>
  Array.from({ length: 12 }, (_, i) => ({
    Anyo: year,
    FK_Periodo: i + 1,
    Valor: 100,
  }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("IneInflationProvider", () => {
  it("returns the series of a 200 with data, and gives the request a signal", async () => {
    const fetch = answer(
      () =>
        new Response(JSON.stringify({ Data: baseYear(2021) }), {
          status: 200,
        }),
    );

    const points = await new IneInflationProvider().getSeries("ES");

    expect(points).toHaveLength(12);
    expect(points[0]).toMatchObject({ series: "ES", base: "2021" });
    expect(fetch.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([400, 403, 429, 500, 503])(
    "throws unavailable on HTTP %i, keeping the status",
    async (status) => {
      answer(() => new Response("{}", { status }));

      const error = await new IneInflationProvider()
        .getSeries("BI")
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(InflationUnavailableError);
      expect((error as InflationUnavailableError).series).toBe("BI");
      expect((error as InflationUnavailableError).status).toBe(status);
    },
  );

  it("throws unavailable on a network failure, keeping the cause", async () => {
    const cause = new TypeError("fetch failed");
    answer(() => Promise.reject(cause));

    const error = await new IneInflationProvider()
      .getSeries("ES")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InflationUnavailableError);
    expect((error as InflationUnavailableError).status).toBeNull();
    expect((error as Error).cause).toBe(cause);
  });

  it("throws unavailable on a 200 that is not JSON", async () => {
    answer(() => new Response("<html>", { status: 200 }));

    await expect(
      new IneInflationProvider().getSeries("ES"),
    ).rejects.toBeInstanceOf(InflationUnavailableError);
  });

  it("keeps a 200 with no usable data a data error, not unavailable", async () => {
    answer(() => new Response(JSON.stringify({ Data: [] }), { status: 200 }));

    const error = await new IneInflationProvider()
      .getSeries("ES")
      .catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(InflationUnavailableError);
    expect((error as Error).message).toMatch(/no usable data/);
  });
});

describe("IneInflationProvider timeouts", () => {
  it("waits twenty seconds by default", () => {
    expect(INE_TIMEOUT_MS).toBe(20_000);
  });

  it("turns a request that does not answer into unavailable, with the timeout as cause", async () => {
    vi.useFakeTimers();
    answer(
      () =>
        new Response(new ReadableStream({ start() {} }), { status: 200 }),
    );

    const error = new IneInflationProvider({ timeoutMs: 1_000 })
      .getSeries("ES")
      .catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1_000);
    const caught = await error;

    expect(caught).toBeInstanceOf(InflationUnavailableError);
    expect((caught as InflationUnavailableError).status).toBeNull();
    expect((caught as Error).cause).toMatchObject({ name: "TimeoutError" });
  });
});
