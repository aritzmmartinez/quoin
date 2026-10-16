import { describe, expect, it } from "vitest";

import { createServerTiming } from "./server-timing";

function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("createServerTiming", () => {
  it("times a synchronous step and returns its result", () => {
    const clock = fakeClock();
    const timing = createServerTiming(clock.now);
    const result = timing.time("positions", () => {
      clock.advance(12.34);
      return 42;
    });
    expect(result).toBe(42);
    expect(timing.header()).toBe("positions;dur=12.3, total;dur=12.3");
  });

  it("times an asynchronous step when it settles, not when it starts", async () => {
    const clock = fakeClock();
    const timing = createServerTiming(clock.now);
    const pending = timing.time("db-ledger", async () => {
      await Promise.resolve();
      clock.advance(30);
      return "rows";
    });
    expect(timing.header()).toBe("total;dur=0.0");
    await expect(pending).resolves.toBe("rows");
    expect(timing.header()).toBe("db-ledger;dur=30.0, total;dur=30.0");
  });

  it("lets parallel steps overlap: total is wall time, not their sum", async () => {
    const clock = fakeClock();
    const timing = createServerTiming(clock.now);
    const a = timing.time("a", async () => {
      await Promise.resolve();
      return 1;
    });
    const b = timing.time("b", async () => {
      await Promise.resolve();
      return 2;
    });
    clock.advance(50);
    await Promise.all([a, b]);
    expect(timing.header()).toBe("a;dur=50.0, b;dur=50.0, total;dur=50.0");
  });

  it("records a failing step as failed and rethrows", async () => {
    const clock = fakeClock();
    const timing = createServerTiming(clock.now);
    expect(() =>
      timing.time("sync", () => {
        clock.advance(1);
        throw new Error("boom");
      }),
    ).toThrow("boom");
    await expect(
      timing.time("async", async () => {
        clock.advance(2);
        throw new Error("bang");
      }),
    ).rejects.toThrow("bang");
    expect(timing.header()).toBe(
      'sync;dur=1.0;desc="failed", async;dur=2.0;desc="failed", total;dur=3.0',
    );
  });

  it("refuses a name that is not an HTTP token", () => {
    const timing = createServerTiming(fakeClock().now);
    expect(() => timing.time("two words", () => 0)).toThrow(/HTTP token/);
    expect(() => timing.time("a,b", () => 0)).toThrow(/HTTP token/);
  });

  it("exposes the value as a Server-Timing header", () => {
    const timing = createServerTiming(fakeClock().now);
    timing.time("x", () => 0);
    expect(timing.headers().get("Server-Timing")).toBe(
      "x;dur=0.0, total;dur=0.0",
    );
  });
});
