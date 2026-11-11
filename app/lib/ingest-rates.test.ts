import { describe, expect, it } from "vitest";

import type { MappedBatch } from "~/adapters/ingestion";

import { planWithRates } from "./ingest-rates";

const batch = (needed: [string, string][], total: number): MappedBatch => ({
  total,
  failed: 0,
  instruments: [],
  events: [],
  operationOf: [],
  discarded: {},
  discardedDetails: {},
  noticed: {},
  errors: [],
  ratesNeeded: new Map(needed),
});

describe("planWithRates", () => {
  it("plans once and asks for no rates when the file needs none", async () => {
    const asked: Map<string, string>[] = [];
    let plans = 0;

    const planned = await planWithRates(
      async () => {
        plans += 1;
        return batch([], 1);
      },
      async (needs) => {
        asked.push(new Map(needs));
        return { book: new Map(), unavailable: [] };
      },
    );

    expect(plans).toBe(1);
    expect(asked).toEqual([]);
    expect(planned.batch.total).toBe(1);
    expect(planned.rateConflicts).toEqual([]);
  });

  it("syncs the currencies and days the first plan missed, then plans again", async () => {
    const asked: Map<string, string>[] = [];
    const plans = [batch([["USD", "2026-01-05"]], 1), batch([], 2)];

    const planned = await planWithRates(
      async () => plans.shift()!,
      async (needs) => {
        asked.push(new Map(needs));
        return { book: new Map(), unavailable: [] };
      },
    );

    expect(asked).toEqual([new Map([["USD", "2026-01-05"]])]);
    expect(planned.batch.total).toBe(2);
  });

  it("passes on the days the ECB now publishes at another rate", async () => {
    const conflict = {
      currency: "USD",
      day: "2026-01-05",
      stored: "1.0832",
      incoming: "1.0830",
    };
    const plans = [batch([["USD", "2026-01-05"]], 1), batch([], 1)];

    const planned = await planWithRates(
      async () => plans.shift()!,
      async () => ({ book: new Map(), unavailable: [], conflicts: [conflict] }),
    );

    expect(planned.rateConflicts).toEqual([conflict]);
  });
});
