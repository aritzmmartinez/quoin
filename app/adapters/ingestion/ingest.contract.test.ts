import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { loadContract } from "../../../test/contract/load";
import {
  evaluate,
  INGEST_CONTRACT_FILE,
  ingestContractJson,
} from "../../../test/contract/ingest-contract";

const contract = loadContract(
  "ingest",
  z.object({
    contract: z.literal("ingest"),
    version: z.literal(1),
    description: z.string(),
    cases: z
      .array(
        z.object({
          name: z.string(),
          zone: z.string(),
          encoding: z.enum(["utf-8", "latin1"]),
          csv: z.string(),
          rates: z.array(
            z.object({
              base: z.string(),
              quote: z.string(),
              day: z.iso.date(),
              rate: z.string(),
              source: z.string(),
            }),
          ),
          prices: z.array(
            z.object({
              instrumentId: z.string(),
              price: z.string(),
              currency: z.string(),
              asOf: z.iso.datetime(),
              source: z.string(),
            }),
          ),
          stored: z.object({
            names: z.record(z.string(), z.string()),
            rewardRefids: z.array(z.string()),
            existing: z.array(z.string()),
          }),
          expect: z.unknown(),
        }),
      )
      .min(1),
  }),
);

describe("ingest contract", () => {
  describe.each(contract.cases)("$name", ({ expect: expected, ...input }) => {
    it("is what the adapters plan", async () => {
      expect(JSON.parse(JSON.stringify(await evaluate(input)))).toEqual(
        expected,
      );
    });
  });

  it("covers every way a file is refused and every row error", () => {
    const outcomes = contract.cases.map((c) =>
      z
        .object({
          rejected: z.object({ reason: z.string() }).optional(),
          errors: z.array(z.object({ reason: z.string() })).optional(),
        })
        .parse(c.expect),
    );
    expect(
      new Set(outcomes.flatMap((o) => (o.rejected ? [o.rejected.reason] : []))),
    ).toEqual(
      new Set([
        "unknown-broker",
        "invalid-encoding",
        "missing-column",
        "unparseable",
        "kraken-legacy-export",
        "kraken-balance-mismatch",
      ]),
    );
    expect(
      new Set(outcomes.flatMap((o) => (o.errors ?? []).map((e) => e.reason))),
    ).toEqual(
      new Set([
        "invalid-date",
        "wrong-field-count",
        "invalid-number",
        "missing-instrument",
      ]),
    );
  });
});

describe("ingest contract source", () => {
  it("is what test/contract/ingest-contract.ts writes", async () => {
    expect(JSON.parse(readFileSync(INGEST_CONTRACT_FILE, "utf8"))).toEqual(
      JSON.parse(await ingestContractJson()),
    );
  });
});
