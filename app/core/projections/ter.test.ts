import { describe, expect, it } from "vitest";

import { computeWeightedTer } from "./ter";

describe("computeWeightedTer", () => {
  it("weights each fee by what the position is worth today", () => {
    const result = computeWeightedTer([
      { instrumentId: "A", value: "7500.00", ter: "0.0022" },
      { instrumentId: "B", value: "2500.00", ter: "0.0042" },
    ]);

    // 0.75 * 0.22% + 0.25 * 0.42% = 0.27%
    expect(result.weightedTer).toBe("0.002700");
    expect(result.annualCost).toBe("27");
    expect(result.coverage).toBe("1.000000");
    expect(result.unknownInstrumentIds).toEqual([]);
  });

  it("excludes a position with no TER instead of calling it free", () => {
    const result = computeWeightedTer([
      { instrumentId: "A", value: "5000.00", ter: "0.0020" },
      { instrumentId: "B", value: "5000.00", ter: null },
    ]);

    // Assuming 0% for B would halve this to 0.10%.
    expect(result.weightedTer).toBe("0.002000");
    expect(result.annualCost).toBe("10");
    expect(result.coveredValue).toBe("5000");
    expect(result.totalValue).toBe("10000");
    expect(result.coverage).toBe("0.500000");
    expect(result.unknownInstrumentIds).toEqual(["B"]);
  });

  it("reports nothing rather than zero when no position has a TER", () => {
    const result = computeWeightedTer([
      { instrumentId: "A", value: "5000.00" },
      { instrumentId: "B", value: "5000.00", ter: "" },
    ]);

    expect(result.weightedTer).toBe("0");
    expect(result.annualCost).toBe("0");
    expect(result.coverage).toBe("0.000000");
    expect(result.unknownInstrumentIds).toEqual(["A", "B"]);
  });

  it("ignores a closed position so its fee cannot weigh on the average", () => {
    const result = computeWeightedTer([
      { instrumentId: "A", value: "1000.00", ter: "0.0030" },
      { instrumentId: "B", value: "0", ter: "0.0500" },
    ]);

    expect(result.weightedTer).toBe("0.003000");
    expect(result.unknownInstrumentIds).toEqual([]);
  });

  it("refuses a negative fee rather than netting it against a real one", () => {
    expect(() =>
      computeWeightedTer([
        { instrumentId: "A", value: "1000.00", ter: "-0.0010" },
      ]),
    ).toThrow(/Not an annual fee/);
  });
});
