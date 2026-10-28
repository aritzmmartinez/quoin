import { describe, expect, it } from "vitest";
import { z } from "zod";

import { loadContract } from "../../../test/contract/load";

import { parseIsoDate, startOfDay } from "./calendar-date";
import { dayOf, fiscalYearOf, periodOf } from "./day";

const contract = loadContract(
  "calendar",
  z.object({
    contract: z.literal("calendar"),
    version: z.literal(1),
    assignments: z
      .array(
        z.object({
          name: z.string(),
          instant: z.iso.datetime(),
          zone: z.string(),
          day: z.iso.date(),
          period: z.string().regex(/^\d{4}-\d{2}$/),
          fiscalYear: z.number().int(),
        }),
      )
      .min(1),
    startOfDay: z
      .array(
        z.object({
          name: z.string(),
          day: z.iso.date(),
          zone: z.string(),
          instant: z.iso.datetime(),
        }),
      )
      .min(1),
  }),
);

describe("calendar contract", () => {
  describe.each(contract.assignments)("$name", (c) => {
    const instant = new Date(c.instant);
    it("day", () => expect(dayOf(instant, c.zone)).toBe(c.day));
    it("period", () => expect(periodOf(instant, c.zone)).toBe(c.period));
    it("fiscal year", () =>
      expect(fiscalYearOf(instant, c.zone)).toBe(c.fiscalYear));
  });

  describe.each(contract.startOfDay)("$name", (c) => {
    it("starts at the instant on file", () => {
      expect(startOfDay(parseIsoDate(c.day), c.zone).toISOString()).toBe(
        c.instant,
      );
    });
  });
});
