import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { loadContract } from "../../../test/contract/load";
import {
  evaluate,
  PORTFOLIO_CONTRACT_FILE,
  portfolioContractJson,
} from "../../../test/contract/portfolio-contract";

const contract = loadContract(
  "portfolio",
  z.object({
    contract: z.literal("portfolio"),
    version: z.literal(1),
    description: z.string(),
    cases: z
      .array(
        z.object({
          name: z.string(),
          residence: z.literal("bizkaia"),
          now: z.iso.datetime(),
          events: z.array(z.record(z.string(), z.unknown())).min(1),
          prices: z.array(
            z.object({
              instrumentId: z.string(),
              price: z.string(),
              currency: z.string(),
              asOf: z.iso.datetime(),
            }),
          ),
          rates: z.array(
            z.object({
              base: z.string(),
              quote: z.string(),
              day: z.iso.date(),
              rate: z.string(),
              source: z.string(),
            }),
          ),
          categories: z.record(z.string(), z.string()),
          topLimit: z.number().int().positive(),
          byHand: z
            .object({
              arithmetic: z.string(),
              positions: z.record(
                z.string(),
                z.object({ quantity: z.string(), costBasis: z.string() }),
              ),
              totalValue: z.string(),
              unrealizedPnL: z.string(),
              openCost: z.string().optional(),
              realizedPnL: z.string().optional(),
            })
            .optional(),
          expect: z.unknown(),
        }),
      )
      .min(1),
  }),
);

describe("portfolio contract", () => {
  describe.each(contract.cases)(
    "$name",
    ({ byHand, expect: expected, ...input }) => {
      const actual = evaluate(input);

      it("is what the core computes", () => {
        expect(JSON.parse(JSON.stringify(actual))).toEqual(expected);
      });

      if (byHand) {
        it("agrees with the figures worked out by hand", () => {
          const held = Object.fromEntries(
            actual.positions.map((p) => [
              p.instrumentId,
              { quantity: p.quantity, costBasis: p.costBasis },
            ]),
          );
          for (const [id, figures] of Object.entries(byHand.positions)) {
            expect(held[id]).toEqual(figures);
          }
          expect(actual.summary.totalValue).toBe(byHand.totalValue);
          expect(actual.summary.unrealizedPnL).toBe(byHand.unrealizedPnL);
          if (byHand.openCost !== undefined) {
            expect(actual.summary.openCost).toBe(byHand.openCost);
          }
          if (byHand.realizedPnL !== undefined) {
            expect(actual.summary.realizedPnL).toBe(byHand.realizedPnL);
          }
        });
      }
    },
  );

  it("works at least three cases out by hand", () => {
    expect(
      contract.cases.filter((c) => c.byHand).length,
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("portfolio contract source", () => {
  it("is what test/contract/portfolio-contract.ts writes", () => {
    expect(JSON.parse(readFileSync(PORTFOLIO_CONTRACT_FILE, "utf8"))).toEqual(
      JSON.parse(portfolioContractJson()),
    );
  });
});
