import type { Effect } from "~/core/sync";

import { runEffects, type RunEffect } from "./sync";

export interface EffectFailures {
  failedPrices: number;
  failedRates: number;
}

export interface EffectQueueDeps {
  run: RunEffect;
  record: (deviceId: string, failures: EffectFailures) => Promise<void>;
  onError: (error: unknown) => void;
}

export class EffectQueue {
  private tail: Promise<void> = Promise.resolve();
  private readonly waiting = new Map<string, number>();
  private stopped = false;

  constructor(private readonly deps: EffectQueueDeps) {}

  enqueue(deviceId: string, effects: readonly Effect[]): void {
    if (effects.length === 0) return;
    for (const effect of effects) this.hold(effect, 1);
    this.tail = this.tail.then(() => this.drain(deviceId, effects));
  }

  pending(): ReadonlySet<string> {
    return new Set(this.waiting.keys());
  }

  idle(): Promise<void> {
    return this.tail;
  }

  stop(): void {
    this.stopped = true;
  }

  private hold(effect: Effect, by: 1 | -1): void {
    if (effect.kind !== "prices") return;
    const count = (this.waiting.get(effect.instrumentId) ?? 0) + by;
    if (count === 0) this.waiting.delete(effect.instrumentId);
    else this.waiting.set(effect.instrumentId, count);
  }

  private async drain(
    deviceId: string,
    effects: readonly Effect[],
  ): Promise<void> {
    const failures: EffectFailures = { failedPrices: 0, failedRates: 0 };
    const count = (effect: Effect) => {
      if (effect.kind === "prices") failures.failedPrices += 1;
      else failures.failedRates += 1;
    };

    let halted = false;
    for (const effect of effects) {
      try {
        if (halted) {
          count(effect);
        } else if (!this.stopped) {
          const [outcome] = await runEffects([effect], this.deps.run);
          if (outcome && !outcome.ok) {
            count(effect);
            this.deps.onError(outcome.reason);
          }
        }
      } catch (error) {
        halted = true;
        count(effect);
        this.deps.onError(error);
      } finally {
        this.hold(effect, -1);
      }
    }

    if (failures.failedPrices === 0 && failures.failedRates === 0) return;
    await this.deps.record(deviceId, failures).catch(this.deps.onError);
  }
}
