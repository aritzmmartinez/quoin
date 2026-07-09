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
