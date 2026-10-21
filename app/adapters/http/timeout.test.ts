import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withTimeout } from "./timeout";

const untilAborted = (signal: AbortSignal): Promise<never> =>
  new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });

const forever = (): Promise<never> => new Promise(() => {});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("withTimeout", () => {
  it("returns what the request returns when it answers in time", async () => {
    await expect(withTimeout(1_000, async () => "ok")).resolves.toBe("ok");
  });

  it("aborts the request's signal with a TimeoutError once the time is up", async () => {
    let seen: AbortSignal | undefined;
    const result = withTimeout(1_000, (signal) => {
      seen = signal;
      return untilAborted(signal);
    });
    const settled = expect(result).rejects.toMatchObject({
      name: "TimeoutError",
      message: "No answer within 1 s",
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(seen?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await settled;
    expect(seen?.aborted).toBe(true);
  });

  it("ends on time even when the request ignores its signal", async () => {
    const result = withTimeout(1_000, forever);
    const settled = expect(result).rejects.toMatchObject({
      name: "TimeoutError",
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await settled;
  });

  it("covers the whole request, not only its first answer", async () => {
    const result = withTimeout(1_000, async (signal) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return untilAborted(signal);
    });
    const settled = expect(result).rejects.toMatchObject({
      name: "TimeoutError",
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await settled;
  });

  it("clears its timer when the request answers", async () => {
    await withTimeout(1_000, async () => "ok");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears its timer when the request fails", async () => {
    await expect(
      withTimeout(1_000, async () => {
        throw new Error("refused");
      }),
    ).rejects.toThrow("refused");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops when an outside signal aborts, with that signal's reason", async () => {
    const outside = new AbortController();
    let seen: AbortSignal | undefined;
    const result = withTimeout(
      60_000,
      (signal) => {
        seen = signal;
        return untilAborted(signal);
      },
      { signal: outside.signal },
    );
    const settled = expect(result).rejects.toMatchObject({
      name: "AbortError",
    });

    outside.abort(new DOMException("Cancelled", "AbortError"));
    await settled;
    expect(seen?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start a request whose outside signal is already aborted", async () => {
    const outside = new AbortController();
    outside.abort(new DOMException("Cancelled", "AbortError"));
    const run = vi.fn(forever);

    await expect(
      withTimeout(60_000, run, { signal: outside.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(run).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
