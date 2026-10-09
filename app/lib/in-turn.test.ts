import { describe, expect, it } from "vitest";

import { inTurn } from "./in-turn";

describe("inTurn", () => {
  it("runs one item at a time, in order", async () => {
    const started: number[] = [];
    let running = 0;
    let overlap = false;

    await inTurn(
      [1, 2, 3],
      async (n) => {
        running += 1;
        if (running > 1) overlap = true;
        started.push(n);
        await Promise.resolve();
        running -= 1;
        return n;
      },
      { onError: () => 0 },
    );

    expect(started).toEqual([1, 2, 3]);
    expect(overlap).toBe(false);
  });

  it("carries on past a failure and reports it in place", async () => {
    const seen: string[] = [];

    const results = await inTurn(
      ["a", "b", "c"],
      async (s) => {
        if (s === "b") throw new Error("boom");
        return `ok:${s}`;
      },
      {
        onError: (_error, s) => `failed:${s}`,
        onEach: (result) => seen.push(result),
      },
    );

    expect(results).toEqual(["ok:a", "failed:b", "ok:c"]);
    expect(seen).toEqual(results);
  });

  it("stops before the next item once asked to, keeping what was done", async () => {
    let stop = false;
    const done: number[] = [];

    const results = await inTurn(
      [1, 2, 3, 4],
      async (n) => {
        done.push(n);
        if (n === 2) stop = true;
        return n;
      },
      { onError: () => 0, stopped: () => stop },
    );

    expect(results).toEqual([1, 2]);
    expect(done).toEqual([1, 2]);
  });
});
