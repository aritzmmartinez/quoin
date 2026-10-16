import { describe, expect, it } from "vitest";

import { fundsStep, setupPending, targetStep, tradesStep } from "./setup";

describe("fundsStep", () => {
  it("is done from two funds with holdings", () => {
    expect(fundsStep(1).done).toBe(false);
    expect(fundsStep(2).done).toBe(true);
  });

  it("reports progress capped at what the step needs", () => {
    expect(fundsStep(1).progress).toEqual({ have: 1, need: 2 });
    expect(fundsStep(5).progress).toEqual({ have: 2, need: 2 });
  });
});

describe("setupPending", () => {
  it("is pending while any step is not done", () => {
    expect(setupPending([tradesStep(true), targetStep(false)])).toBe(true);
    expect(setupPending([tradesStep(true), targetStep(true)])).toBe(false);
  });
});
