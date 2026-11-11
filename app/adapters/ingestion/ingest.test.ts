import { describe, it, expect } from "vitest";

import type { LedgerEvent } from "~/core/domain";
import { rateBookFrom } from "~/core/fx";
import { ledgerDedupKey } from "~/core/ports";

import { rateLookupFrom } from "./fx";

import {
  BatchBuilder,
  countOperations,
  InvalidLedgerEventError,
  nothingToImport,
  operationsToWrite,
  previewBatch,
  writesLedger,
  type MappedBatch,
} from "./ingest";

const MADRID = "Europe/Madrid";

function event(externalId: string): LedgerEvent {
  return {
    id: `id-${externalId}`,
    ts: new Date("2025-01-01"),
    type: "DEPOSIT",
    grossAmount: "100",
    currency: "EUR",
    account: "test",
    source: "TEST",
    externalId,
    note: null,
  };
}

function batch(events: LedgerEvent[]): MappedBatch {
  const builder = new BatchBuilder(MADRID);
  for (const e of events)
    builder.add({ kind: "domain", instrument: null, event: e });
  return builder.build();
}

describe("previewBatch", () => {
  it("splits new vs duplicate without writing", async () => {
    const b = batch([event("a"), event("b"), event("c")]);
    const ledger = {
      append: async () => ({ inserted: 0, skipped: 0 }),
      list: async () => [],
      existing: async () => new Set([ledgerDedupKey("TEST", "b")]),
      markInKind: async () => 0,
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
    markInKind: async () => 0,
  });

  function rewardBatch(): MappedBatch {
    const builder = new BatchBuilder(MADRID);
    builder.addOperation([
      { kind: "domain", instrument: null, event: event("R1") },
      { kind: "domain", instrument: null, event: event("R1:income") },
    ]);
    builder.addOperation([
      { kind: "domain", instrument: null, event: event("R2") },
      { kind: "domain", instrument: null, event: event("R2:income") },
    ]);
    builder.addOperation([{ kind: "discard", reason: "internal-move" }]);
    builder.addOperation([
      { kind: "domain", instrument: null, event: event("D1") },
    ]);
    return builder.build();
  }

  it("counts a reward's two rows as one operation", async () => {
    const summary = await previewBatch(ledgerWith([]), rewardBatch());
    expect(summary.imported).toBe(3);
    expect(summary.duplicates).toBe(0);
  });

  it("counts an operation as new only when none of its rows is stored, as a duplicate when all are, and as completed in between", async () => {
    const summary = await previewBatch(
      ledgerWith(["R1", "R1:income", "R2"]),
      rewardBatch(),
    );
    expect(summary.imported).toBe(1);
    expect(summary.completed).toBe(1);
    expect(summary.duplicates).toBe(1);
  });

  it("counts every operation exactly once, whatever is stored", () => {
    const stored = [
      [],
      ["R1"],
      ["R1:income", "R2"],
      ["R1", "R1:income", "R2", "D1"],
      ["R1", "R1:income", "R2", "R2:income", "D1"],
    ];
    const expected = [
      { imported: 3, completed: 0, duplicates: 0 },
      { imported: 2, completed: 1, duplicates: 0 },
      { imported: 1, completed: 2, duplicates: 0 },
      { imported: 0, completed: 1, duplicates: 2 },
      { imported: 0, completed: 0, duplicates: 3 },
    ];
    const b = rewardBatch();
    const operations = new Set(b.operationOf).size;
    expect(operations).toBe(3);
    stored.forEach((keys, i) => {
      const counts = countOperations(
        b,
        new Set(keys.map((k) => ledgerDedupKey("TEST", k))),
      );
      expect(counts).toEqual(expected[i]);
      expect(counts.imported + counts.completed + counts.duplicates).toBe(
        operations,
      );
    });
  });

  it("counts what the import button writes: new and completed, never duplicates", () => {
    expect(operationsToWrite({ imported: 0, completed: 1 })).toBe(1);
    expect(operationsToWrite({ imported: 2, completed: 1 })).toBe(3);
    expect(operationsToWrite({ imported: 0, completed: 0 })).toBe(0);
  });

  it("says a file is already stored only when every operation is a duplicate", () => {
    expect(nothingToImport({ total: 3, duplicates: 3 })).toBe("already-stored");
    expect(nothingToImport({ total: 2, duplicates: 0 })).toBe(
      "nothing-to-save",
    );
    expect(nothingToImport({ total: 3, duplicates: 2 })).toBe(
      "nothing-to-save",
    );
    expect(nothingToImport({ total: 0, duplicates: 0 })).toBe(
      "nothing-to-save",
    );
  });

  it("writes when an operation is new or completed, and not for duplicates alone", () => {
    expect(writesLedger({ imported: 1, completed: 0 })).toBe(true);
    expect(writesLedger({ imported: 0, completed: 1 })).toBe(true);
    expect(writesLedger({ imported: 0, completed: 0 })).toBe(false);
  });

  it("adds up to the operations in the file", async () => {
    const builder = new BatchBuilder(MADRID);
    builder.addOperation([
      { kind: "domain", instrument: null, event: event("A") },
    ]);
    builder.addOperation([{ kind: "discard", reason: "card-spending" }]);
    builder.addError({
      externalId: "x",
      position: null,
      date: "2025-01-02",
      type: "BUY",
      reason: "invalid-number",
    });
    const b = builder.build();

    const summary = await previewBatch(ledgerWith([]), b);
    const discarded = Object.values(summary.discarded).reduce(
      (s, n) => s + n,
      0,
    );
    expect(
      summary.imported +
        summary.completed +
        summary.duplicates +
        discarded +
        summary.failed,
    ).toBe(summary.total);
    expect(summary.failed).toBe(summary.errors.length);
  });

  it("counts an operation set aside or failed once, its other rows nested under its main one", () => {
    const builder = new BatchBuilder(MADRID);
    const row = (type: string) => ({
      date: "2025-01-01",
      type,
      subtype: null,
      instrument: "F",
    });
    builder.addOperation([
      {
        kind: "discard",
        reason: "unsupported-asset-class",
        detail: row("BUY"),
      },
      {
        kind: "discard",
        reason: "saveback-unpaired",
        detail: row("BENEFITS_SAVEBACK"),
      },
    ]);
    const error = (externalId: string) => ({
      externalId,
      position: null,
      date: "2025-01-02",
      type: "BUY",
      reason: "invalid-number" as const,
    });
    builder.addError(error("b1"), error("s1"));
    const b = builder.build();

    expect(b.total).toBe(2);
    expect(b.discarded).toEqual({ "unsupported-asset-class": 1 });
    expect(b.discardedDetails["unsupported-asset-class"]).toEqual([
      { ...row("BUY"), rows: [row("BENEFITS_SAVEBACK")] },
    ]);
    expect(b.failed).toBe(1);
    expect(b.errors).toEqual([{ ...error("b1"), rows: [error("s1")] }]);
  });
});

describe("events the ledger cannot book as they stand", () => {
  const usd = (externalId: string): LedgerEvent => ({
    ...event(externalId),
    ts: new Date("2025-11-13T23:30:00Z"),
    currency: "USD",
  });

  const rates = rateLookupFrom(
    rateBookFrom([
      {
        source: "ECB",
        base: "EUR",
        quote: "USD",
        day: "2025-11-14",
        rate: "1.25",
      },
    ]),
    MADRID,
  );

  it("converts an amount in another currency at the ECB rate of its Madrid day", () => {
    const builder = new BatchBuilder(MADRID, rates);
    builder.add({ kind: "domain", instrument: null, event: usd("b") });
    const b = builder.build();

    expect(b.events).toHaveLength(1);
    expect(b.events[0]).toMatchObject({
      currency: "USD",
      grossAmount: "100",
      fxSource: "ECB",
      fxRate: "1.25",
      fxDirection: "QUOTE_PER_BASE",
      fxDate: "2025-11-14",
    });
    expect(b.ratesNeeded.size).toBe(0);
  });

  it("sets aside an amount with no rate for its day as fx-unavailable, and keeps the rest", () => {
    const builder = new BatchBuilder(MADRID);
    builder.add({ kind: "domain", instrument: null, event: event("a") });
    builder.add({ kind: "domain", instrument: null, event: usd("b") });
    const b = builder.build();

    expect(b.events.map((e) => e.externalId)).toEqual(["a"]);
    expect(b.discarded).toEqual({ "fx-unavailable": 1 });
    expect(b.discardedDetails["fx-unavailable"]).toEqual([
      {
        date: "2025-11-13T23:30:00.000Z",
        type: "DEPOSIT",
        subtype: null,
        instrument: "USD",
      },
    ]);
  });

  it("names the instrument and the currency when the event has one", () => {
    const builder = new BatchBuilder(MADRID);
    builder.add({
      kind: "domain",
      instrument: {
        id: "US00TEST0001",
        name: "Synthetic Stock",
        type: "STOCK",
        thesis: "CORE",
      },
      event: usd("b"),
    });

    expect(
      builder.build().discardedDetails["fx-unavailable"]?.[0]?.instrument,
    ).toBe("Synthetic Stock (USD)");
  });

  it("records the earliest Madrid day each currency was missing a rate for", () => {
    const builder = new BatchBuilder(MADRID);
    builder.add({ kind: "domain", instrument: null, event: usd("b") });
    builder.add({
      kind: "domain",
      instrument: null,
      event: { ...usd("c"), ts: new Date("2025-11-02T10:00:00Z") },
    });
    builder.add({
      kind: "domain",
      instrument: null,
      event: { ...usd("d"), currency: "GBP" },
    });

    expect(builder.build().ratesNeeded).toEqual(
      new Map([
        ["USD", "2025-11-02"],
        ["GBP", "2025-11-14"],
      ]),
    );
  });

  it("sets aside a whole operation when one of its rows has no rate, counting it once", () => {
    const builder = new BatchBuilder(MADRID);
    builder.addOperation([
      { kind: "domain", instrument: null, event: event("p") },
      { kind: "domain", instrument: null, event: usd("p:income") },
    ]);
    const b = builder.build();

    expect(b.events).toEqual([]);
    expect(b.discarded).toEqual({ "fx-unavailable": 1 });
  });

  it("refuses the whole batch on any other break of the rule, naming the row by its Madrid day", () => {
    const builder = new BatchBuilder(MADRID);
    builder.add({ kind: "domain", instrument: null, event: event("a") });
    builder.add({
      kind: "domain",
      instrument: null,
      event: { ...usd("b"), fxSource: "ECB" },
    });

    let error: unknown;
    try {
      builder.build();
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(InvalidLedgerEventError);
    expect(error).toMatchObject({
      date: "2025-11-14",
      type: "DEPOSIT",
      currency: "USD",
    });
  });
});
