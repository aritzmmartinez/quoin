import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { at } from "./build";
import { loadContract } from "./load";

const byHandSchema = z.object({
  arithmetic: z.string(),
  figures: z.record(z.string(), z.string().nullable()),
});

export function describeContract<C extends { name: string }>(options: {
  name: string;
  file: string;
  json: () => string;
  evaluate: (input: C) => unknown;
  minByHand: number;
}): void {
  const contract = loadContract(
    options.name,
    z.object({
      contract: z.literal(options.name),
      version: z.literal(1),
      description: z.string(),
      cases: z
        .array(
          z.looseObject({
            name: z.string(),
            byHand: byHandSchema.optional(),
            expect: z.unknown(),
          }),
        )
        .min(1),
    }),
  );

  describe(`${options.name} contract`, () => {
    describe.each(contract.cases)(
      "$name",
      ({ byHand, expect: expected, ...input }) => {
        const actual = JSON.parse(
          JSON.stringify(options.evaluate(input as unknown as C)),
        );

        it("is what the core computes", () => {
          expect(actual).toEqual(expected);
        });

        if (byHand) {
          it("agrees with the figures worked out by hand", () => {
            for (const [path, figure] of Object.entries(byHand.figures)) {
              expect(at(actual, path), path).toBe(figure);
            }
          });
        }
      },
    );

    it(`works at least ${options.minByHand} cases out by hand`, () => {
      expect(
        contract.cases.filter((c) => c.byHand).length,
      ).toBeGreaterThanOrEqual(options.minByHand);
    });

    it("is what its generator writes", () => {
      expect(JSON.parse(readFileSync(options.file, "utf8"))).toEqual(
        JSON.parse(options.json()),
      );
    });
  });
}
