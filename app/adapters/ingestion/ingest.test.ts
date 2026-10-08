import { describe, it, expect } from "vitest";

import type { LedgerEvent } from "~/core/domain";
import { ledgerDedupKey } from "~/core/ports";

import { BatchBuilder, previewBatch, type MappedBatch } from "./ingest";

function event(externalId: string): LedgerEvent {
  return {
    id: `id-${externalId}`,
    ts: new Date("2025-01-01"),
    type: "DEPOSIT",
    grossAmount: "100",
    currency: "EUR",
    fxToBase: "1",
    account: "test",
    source: "TEST",
    externalId,
    note: null,
  };
}

function batch(events: LedgerEvent[]): MappedBatch {
  const builder = new BatchBuilder();
  for (const e of events)
    builder.add({ kind: "domain", instrument: null, event: e });
  return builder.build(events.length);
}

describe("previewBatch", () => {
  it("splits new vs duplicate without writing", async () => {
    const b = batch([event("a"), event("b"), event("c")]);
    const ledger = {
      append: async () => ({ inserted: 0, skipped: 0 }),
      list: async () => [],
      existing: async () => new Set([ledgerDedupKey("TEST", "b")]),
    };

    const summary = await previewBatch(ledger, b);
    expect(summary.total).toBe(3);
    expect(summary.imported).toBe(2);
    expect(summary.duplicates).toBe(1);
  });
});

describe("counting by operation", () => {
  const ledgerWith = (keys: string[]) => ({
    append: async () => ({ inserted: 0, skipped: 0 }),
    list: async () => [],
    existing: async () => new Set(keys.map((k) => ledgerDedupKey("TEST", k))),
  });

  function rewardBatch(): MappedBatch {
    const builder = new BatchBuilder();
    builder.addOperation([
      { kind: "domain", instrument: null, event: event("R1") },
      { kind: "domain", instrument: null, event: event("R1:income") },
    ]);
    builder.addOperation([
      { kind: "domain", instrument: null, event: event("R2") },
      { kind: "domain", instrument: null, event: event("R2:income") },
    ]);
    builder.addOperation([
      { kind: "discard", reason: "unmodelled-asset" },
    ]);
    builder.addOperation([{ kind: "domain", instrument: null, event: event("D1") }]);
    return builder.build(5);
  }

  it("counts a reward's two rows as one operation", async () => {
    const summary = await previewBatch(ledgerWith([]), rewardBatch());
    expect(summary.imported).toBe(3);
    expect(summary.duplicates).toBe(0);
  });

  it("counts an operation as new when any of its rows is, and as a duplicate only when all are", async () => {
    const summary = await previewBatch(
      ledgerWith(["R1", "R1:income", "R2", "D1"]),
      rewardBatch(),
    );
    expect(summary.imported).toBe(1);
    expect(summary.duplicates).toBe(2);
  });

  it("adds up to the operations in the file", async () => {
    const builder = new BatchBuilder();
    builder.addOperation([{ kind: "domain", instrument: null, event: event("A") }]);
    builder.addOperation([{ kind: "discard", reason: "card-spending" }]);
    builder.addError();
    const b = builder.build(3);

    const summary = await previewBatch(ledgerWith([]), b);
    const discarded = Object.values(summary.discarded).reduce((s, n) => s + n, 0);
    expect(
      summary.imported + summary.duplicates + discarded + summary.errors,
    ).toBe(summary.total);
  });
});
