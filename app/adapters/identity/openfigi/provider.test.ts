import { describe, expect, it, vi } from "vitest";

import { IdentityResolutionUnavailableError, type RawIdentity } from "~/core/ports";

import { OPENFIGI_TIMEOUT_MS, OpenFigiIdentityResolver } from "./provider";

const ticker = (value: string): RawIdentity => ({ value, kind: "TICKER" });

function fakeFetch(shareClassFIGI = "BBG001S5S399") {
  const calls: { jobs: unknown[]; headers: Record<string, string> }[] = [];

  const impl = vi.fn(async (_url: string, init?: RequestInit) => {
    const jobs = JSON.parse(String(init?.body)) as unknown[];
    calls.push({
      jobs,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return {
      ok: true,
      status: 200,
      json: async () => jobs.map(() => ({ data: [{ shareClassFIGI }] })),
    } as unknown as Response;
  });

  return { impl: impl as unknown as typeof fetch, calls };
}

describe("OpenFigiIdentityResolver", () => {
  it("resolves an ISIN and a ticker to the same canonical id", async () => {
    const { impl } = fakeFetch("BBG001S5S399");
    const { resolutions: resolved, unavailable } =
      await new OpenFigiIdentityResolver({
        minIntervalMs: 0,
        fetchImpl: impl,
        apiKey: "k",
      }).resolve([{ value: "US67066G1040", kind: "ISIN" }, ticker("NVDA.US")]);

    expect(unavailable).toBeNull();
    expect(resolved.get("US67066G1040")).toEqual(resolved.get("NVDA.US"));
    expect(resolved.get("NVDA.US")).toEqual({
      status: "resolved",
      canonicalId: "BBG001S5S399",
      exchCode: null,
    });
  });

  it("splits into ten-job requests without a key", async () => {
    const { impl, calls } = fakeFetch();
    const identities = Array.from({ length: 25 }, (_, i) => ticker(`T${i}.US`));
    await new OpenFigiIdentityResolver({
      minIntervalMs: 0,
      fetchImpl: impl,
      apiKey: undefined,
    }).resolve(identities);

    expect(calls.map((c) => c.jobs.length)).toEqual([10, 10, 5]);
  });

  it("splits into hundred-job requests with a key", async () => {
    const { impl, calls } = fakeFetch();
    const identities = Array.from({ length: 150 }, (_, i) =>
      ticker(`T${i}.US`),
    );
    await new OpenFigiIdentityResolver({
      minIntervalMs: 0,
      fetchImpl: impl,
      apiKey: "k",
    }).resolve(identities);

    expect(calls.map((c) => c.jobs.length)).toEqual([100, 50]);
  });

  it("sends the key only when it has one", async () => {
    const withKey = fakeFetch();
    await new OpenFigiIdentityResolver({
      minIntervalMs: 0,
      fetchImpl: withKey.impl,
      apiKey: "abc",
    }).resolve([ticker("A.US")]);
    expect(withKey.calls[0]?.headers["X-OPENFIGI-APIKEY"]).toBe("abc");

    const without = fakeFetch();
    await new OpenFigiIdentityResolver({
      minIntervalMs: 0,
      fetchImpl: without.impl,
      apiKey: undefined,
    }).resolve([ticker("A.US")]);
    expect(without.calls[0]?.headers["X-OPENFIGI-APIKEY"]).toBeUndefined();
  });

  it("honours a budget by taking the first identities, which are the heaviest", async () => {
    const { impl, calls } = fakeFetch();
    const identities = Array.from({ length: 50 }, (_, i) => ticker(`T${i}.US`));
    await new OpenFigiIdentityResolver({
      minIntervalMs: 0,
      fetchImpl: impl,
      apiKey: "k",
      maxIdentities: 12,
    }).resolve(identities);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.jobs).toHaveLength(12);
  });

  it.each([400, 429, 500, 503])(
    "reports HTTP %i as unavailable and never as a miss",
    async (status) => {
      const impl = vi.fn(async () => ({
        ok: false,
        status,
      })) as unknown as typeof fetch;
      const { resolutions, unavailable } = await new OpenFigiIdentityResolver(
        { minIntervalMs: 0, fetchImpl: impl, apiKey: "k" },
      ).resolve([ticker("A.US"), ticker("B.US")]);

      expect(resolutions.size).toBe(0);
      expect(unavailable).toBeInstanceOf(IdentityResolutionUnavailableError);
      expect(unavailable?.status).toBe(status);
    },
  );

  it("reports a payload that is not the array the API promises as unavailable", async () => {
    const impl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: true }),
    })) as unknown as typeof fetch;

    const { resolutions, unavailable } = await new OpenFigiIdentityResolver({
      minIntervalMs: 0,
      fetchImpl: impl,
      apiKey: "k",
    }).resolve([ticker("A.US")]);

    expect(resolutions.size).toBe(0);
    expect(unavailable?.status).toBe(200);
  });

  it("reports a network failure as unavailable, keeping the cause", async () => {
    const cause = new TypeError("fetch failed");
    const impl = vi.fn(() => Promise.reject(cause)) as unknown as typeof fetch;

    const { unavailable } = await new OpenFigiIdentityResolver({
      minIntervalMs: 0,
      fetchImpl: impl,
      apiKey: "k",
    }).resolve([ticker("A.US")]);

    expect(unavailable?.status).toBeNull();
    expect(unavailable?.cause).toBe(cause);
  });

  it("stops at the first batch that is not answered and keeps the ones before it", async () => {
    const { impl: answers } = fakeFetch();
    let call = 0;
    const impl = vi.fn(async (url: string, init?: RequestInit) => {
      call += 1;
      if (call === 2) return { ok: false, status: 503 } as Response;
      return answers(url, init);
    }) as unknown as typeof fetch;
    const seen: number[] = [];

    const { resolutions, unavailable } = await new OpenFigiIdentityResolver({
      minIntervalMs: 0,
      fetchImpl: impl,
      apiKey: undefined,
      onProgress: (done) => seen.push(done),
    }).resolve(Array.from({ length: 25 }, (_, i) => ticker(`T${i}.US`)));

    expect(call).toBe(2);
    expect(resolutions.size).toBe(10);
    expect(resolutions.has("T10.US")).toBe(false);
    expect(unavailable?.status).toBe(503);
    expect(seen).toEqual([10]);
  });

  it("gives every request a signal", async () => {
    const { impl } = fakeFetch();
    await new OpenFigiIdentityResolver({
      minIntervalMs: 0,
      fetchImpl: impl,
      apiKey: "k",
    }).resolve([ticker("A.US")]);

    const init = vi.mocked(impl).mock.calls[0]?.[1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("waits longer for a hundred jobs with a key than for ten without", () => {
    expect(OPENFIGI_TIMEOUT_MS).toEqual({
      anonymous: 30_000,
      authenticated: 120_000,
    });
  });

  it("turns a request that does not answer into unavailable, with the timeout as cause", async () => {
    vi.useFakeTimers();
    try {
      const impl = vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            );
          }),
      ) as unknown as typeof fetch;

      const result = new OpenFigiIdentityResolver({
        minIntervalMs: 0,
        fetchImpl: impl,
        apiKey: "k",
        timeoutMs: 1_000,
      }).resolve([ticker("A.US")]);
      await vi.advanceTimersByTimeAsync(1_000);
      const { resolutions, unavailable } = await result;

      expect(resolutions.size).toBe(0);
      expect(unavailable?.status).toBeNull();
      expect(unavailable?.cause).toMatchObject({ name: "TimeoutError" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports progress, since an unauthenticated run takes minutes", async () => {
    const { impl } = fakeFetch();
    const seen: number[] = [];
    await new OpenFigiIdentityResolver({
      minIntervalMs: 0,
      fetchImpl: impl,
      apiKey: "k",
      onProgress: (done) => seen.push(done),
    }).resolve(Array.from({ length: 150 }, (_, i) => ticker(`T${i}.US`)));

    expect(seen).toEqual([100, 150]);
  });

  it("does nothing, and calls nothing, for an empty batch", async () => {
    const { impl, calls } = fakeFetch();
    const { resolutions: resolved } = await new OpenFigiIdentityResolver({
      minIntervalMs: 0,
      fetchImpl: impl,
    }).resolve([]);
    expect(resolved.size).toBe(0);
    expect(calls).toHaveLength(0);
  });
});
