import { describe, expect, it, vi } from "vitest";

import { MarketDataUnavailableError } from "~/core/ports";
import type { Effect } from "~/core/sync";

import type { RunEffect } from "./sync";
import { EffectQueue, type EffectFailures } from "./sync-effects";

const prices = (instrumentId: string): Effect => ({
  kind: "prices",
  instrumentId,
  symbol: "TEST.DE",
});
const rates: Effect = { kind: "rates", currency: "USD", since: "x" };
const ok: RunEffect = async (effect) => ({ effect, ok: true });

function queueWith(run: RunEffect) {
  const recorded: [string, EffectFailures][] = [];
  const errors: unknown[] = [];
  const queue = new EffectQueue({
    run,
    record: async (deviceId, failures) => {
      recorded.push([deviceId, failures]);
    },
    onError: (error) => errors.push(error),
  });
  return { queue, recorded, errors };
}

describe("EffectQueue", () => {
  it("runs one at a time, in order, across exchanges", async () => {
    const order: string[] = [];
    let running = 0;
    const { queue } = queueWith(async (effect) => {
      expect(++running).toBe(1);
      await Promise.resolve();
      order.push(effect.kind === "prices" ? effect.instrumentId : "rates");
      running -= 1;
      return { effect, ok: true };
    });

    queue.enqueue("phone", [prices("A"), rates]);
    queue.enqueue("phone", [prices("B")]);
    await queue.idle();

    expect(order).toEqual(["A", "rates", "B"]);
  });

  it("holds an instrument as pending only until its own download ends", async () => {
    const finish: (() => void)[] = [];
    const { queue } = queueWith(async (effect) => {
      await new Promise<void>((resolve) => finish.push(resolve));
      return { effect, ok: true };
    });

    queue.enqueue("phone", [prices("A"), prices("B"), rates]);
    expect([...queue.pending()].sort()).toEqual(["A", "B"]);

    await vi.waitFor(() => expect(finish).toHaveLength(1));
    finish[0]?.();
    await vi.waitFor(() => expect([...queue.pending()]).toEqual(["B"]));
    await vi.waitFor(() => expect(finish).toHaveLength(2));
    finish[1]?.();
    await vi.waitFor(() => expect([...queue.pending()]).toEqual([]));
    await vi.waitFor(() => expect(finish).toHaveLength(3));
    finish[2]?.();
    await queue.idle();
  });

  it("releases a failed download, so it is never pending for good, and counts it apart from rates", async () => {
    const { queue, recorded } = queueWith(async (effect) =>
      effect.kind === "prices" && effect.instrumentId === "A"
        ? { effect, ok: false, reason: "no-candles" }
        : effect.kind === "rates"
          ? { effect, ok: false, reason: "rates-unavailable" }
          : { effect, ok: true },
    );

    queue.enqueue("phone", [prices("A"), prices("B"), rates]);
    await queue.idle();

    expect(queue.pending().size).toBe(0);
    expect(recorded).toEqual([["phone", { failedPrices: 1, failedRates: 1 }]]);
  });

  it("counts a provider that does not answer, and carries on", async () => {
    const run = vi.fn<RunEffect>(async (effect) => {
      if (effect.kind === "prices" && effect.instrumentId === "A") {
        throw new MarketDataUnavailableError("TEST.DE", 429);
      }
      return { effect, ok: true };
    });
    const { queue, recorded } = queueWith(run);

    queue.enqueue("phone", [prices("A"), prices("B")]);
    await queue.idle();

    expect(run).toHaveBeenCalledTimes(2);
    expect(recorded).toEqual([["phone", { failedPrices: 1, failedRates: 0 }]]);
  });

  it("stops on a failure that is not the provider's, says it once and counts what is left", async () => {
    const boom = new Error("disk full");
    const run = vi.fn<RunEffect>(async () => {
      throw boom;
    });
    const { queue, recorded, errors } = queueWith(run);

    queue.enqueue("phone", [prices("A"), prices("B"), rates]);
    await queue.idle();

    expect(run).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([boom]);
    expect(queue.pending().size).toBe(0);
    expect(recorded).toEqual([["phone", { failedPrices: 2, failedRates: 1 }]]);
  });

  it("keeps working after an exchange whose failures could not be recorded", async () => {
    const run = vi.fn<RunEffect>(async (effect) => ({
      effect,
      ok: false,
      reason: "no-candles",
    }));
    const errors: unknown[] = [];
    const queue = new EffectQueue({
      run,
      record: async () => {
        throw new Error("busy");
      },
      onError: (error) => errors.push(error),
    });

    queue.enqueue("phone", [prices("A")]);
    queue.enqueue("phone", [prices("B")]);
    await queue.idle();

    expect(run).toHaveBeenCalledTimes(2);
    expect(errors).toContainEqual(new Error("busy"));
  });

  it("records nothing when everything worked", async () => {
    const { queue, recorded } = queueWith(ok);
    queue.enqueue("phone", [prices("A")]);
    queue.enqueue("phone", []);
    await queue.idle();
    expect(recorded).toEqual([]);
  });

  it("starts nothing more once stopped, and lets go of what it held", async () => {
    let queue: EffectQueue | null = null;
    const run = vi.fn<RunEffect>(async (effect) => {
      queue?.stop();
      return { effect, ok: true };
    });
    queue = queueWith(run).queue;

    queue.enqueue("phone", [prices("A"), prices("B")]);
    await queue.idle();

    expect(run).toHaveBeenCalledTimes(1);
    expect(queue.pending().size).toBe(0);
  });
});
