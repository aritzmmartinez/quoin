import { describe, expect, it, vi } from "vitest";

import type { RawIdentity } from "~/core/ports";

import { OpenFigiIdentityResolver } from "./provider";

const ticker = (value: string): RawIdentity => ({ value, kind: "TICKER" });

/** A fetch that answers every job with the same share class. */
function fakeFetch(shareClassFIGI = "BBG001S5S399") {
  const calls: { jobs: unknown[]; headers: Record<string, string> }[] = [];

  const impl = vi.fn(async (_url: string, init?: RequestInit) => {
    const jobs = JSON.parse(String(init?.body)) as unknown[];
    calls.push({ jobs, headers: (init?.headers ?? {}) as Record<string, string> });
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
    // The entire point of the exercise.
    const { impl } = fakeFetch("BBG001S5S399");
    const resolved = await new OpenFigiIdentityResolver({
      minIntervalMs: 0,
      fetchImpl: impl,
      apiKey: "k",
    }).resolve([{ value: "US67066G1040", kind: "ISIN" }, ticker("NVDA.US")]);

    expect(resolved.get("US67066G1040")).toEqual(resolved.get("NVDA.US"));
    expect(resolved.get("NVDA.US")).toEqual({
      status: "resolved",
      canonicalId: "BBG001S5S399",
    });
  });

  it("splits into ten-job requests without a key", async () => {
    // Unauthenticated the endpoint rejects an eleventh job with a 413.
    const { impl, calls } = fakeFetch();
    const identities = Array.from({ length: 25 }, (_, i) => ticker(`T${i}.US`));
    await new OpenFigiIdentityResolver({
      minIntervalMs: 0, fetchImpl: impl, apiKey: undefined }).resolve(
      identities,
    );

    expect(calls.map((c) => c.jobs.length)).toEqual([10, 10, 5]);
  });

  it("splits into hundred-job requests with a key", async () => {
    const { impl, calls } = fakeFetch();
    const identities = Array.from({ length: 150 }, (_, i) => ticker(`T${i}.US`));
    await new OpenFigiIdentityResolver({
      minIntervalMs: 0, fetchImpl: impl, apiKey: "k" }).resolve(
      identities,
    );

    expect(calls.map((c) => c.jobs.length)).toEqual([100, 50]);
  });

  it("sends the key only when it has one", async () => {
    const withKey = fakeFetch();
    await new OpenFigiIdentityResolver({
      minIntervalMs: 0, fetchImpl: withKey.impl, apiKey: "abc" }).resolve(
      [ticker("A.US")],
    );
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
    // Callers sort by weight, so a truncated run still resolves everything a
    // person can see and leaves the tail — which is not drawn anyway.
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

  it("degrades a failed batch to misses instead of failing the import", async () => {
    // A leaf that does not resolve keeps its raw identity: it will not merge
    // with its twin, but it still appears with the right value.
    const impl = vi.fn(async () => ({ ok: false, status: 429 })) as unknown as typeof fetch;
    const resolved = await new OpenFigiIdentityResolver({
      minIntervalMs: 0,
      fetchImpl: impl,
      apiKey: "k",
    }).resolve([ticker("A.US"), ticker("B.US")]);

    expect(resolved.get("A.US")).toEqual({ status: "not-found" });
    expect(resolved.size).toBe(2);
  });

  it("degrades when the payload is not the array the API promises", async () => {
    const impl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: true }),
    })) as unknown as typeof fetch;

    const resolved = await new OpenFigiIdentityResolver({
      minIntervalMs: 0,
      fetchImpl: impl,
      apiKey: "k",
    }).resolve([ticker("A.US")]);
    expect(resolved.get("A.US")).toEqual({ status: "not-found" });
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
    const resolved = await new OpenFigiIdentityResolver({
      minIntervalMs: 0, fetchImpl: impl }).resolve([]);
    expect(resolved.size).toBe(0);
    expect(calls).toHaveLength(0);
  });
});
