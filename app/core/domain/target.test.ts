import { describe, expect, it } from "vitest";

import {
  deriveTargetWeights,
  findIdMismatches,
  getActiveTarget,
  monthlyTotal,
  parseTargetLines,
  TargetParseError,
  type PortfolioTarget,
  type PortfolioTargetLine,
} from "./target";

function target(
  id: string,
  activeFrom: string,
  lines: PortfolioTargetLine[],
  createdAt = "2026-01-01T00:00:00.000Z",
): PortfolioTarget {
  return {
    id,
    name: id,
    activeFrom: new Date(activeFrom),
    note: null,
    createdAt: new Date(createdAt),
    lines,
  };
}

const line = (
  instrumentId: string,
  monthlyAmount: string,
): PortfolioTargetLine => ({ instrumentId, monthlyAmount });

describe("getActiveTarget", () => {
  const versions = [
    target("v1", "2026-01-01T00:00:00.000Z", [line("FTSE", "250")]),
    target("v2", "2026-03-01T00:00:00.000Z", [line("FTSE", "300")]),
    target("v3", "2026-06-01T00:00:00.000Z", [line("FTSE", "300")]),
  ];

  it("picks the latest version whose validity has begun", () => {
    expect(
      getActiveTarget(versions, new Date("2026-04-15T00:00:00.000Z"))?.id,
    ).toBe("v2");
  });

  it("includes the version that starts exactly on the asked date", () => {
    expect(
      getActiveTarget(versions, new Date("2026-06-01T00:00:00.000Z"))?.id,
    ).toBe("v3");
  });

  it("ignores versions that have not taken over yet", () => {
    expect(
      getActiveTarget(versions, new Date("2026-05-31T23:59:59.000Z"))?.id,
    ).toBe("v2");
  });

  it("returns null before the first version begins", () => {
    expect(
      getActiveTarget(versions, new Date("2025-12-31T00:00:00.000Z")),
    ).toBeNull();
  });

  it("does not depend on the order the versions come in", () => {
    const shuffled = [
      versions[2],
      versions[0],
      versions[1],
    ] as PortfolioTarget[];
    expect(
      getActiveTarget(shuffled, new Date("2026-04-15T00:00:00.000Z"))?.id,
    ).toBe("v2");
  });

  it("breaks an exact activeFrom tie by createdAt", () => {
    const first = target(
      "first",
      "2026-03-01T00:00:00.000Z",
      [],
      "2026-02-20T10:00:00.000Z",
    );
    const correction = target(
      "correction",
      "2026-03-01T00:00:00.000Z",
      [],
      "2026-02-28T10:00:00.000Z",
    );

    expect(
      getActiveTarget([first, correction], new Date("2026-04-01T00:00:00.000Z"))
        ?.id,
    ).toBe("correction");
    expect(
      getActiveTarget([correction, first], new Date("2026-04-01T00:00:00.000Z"))
        ?.id,
    ).toBe("correction");
  });

  it("does not let a late-recorded version outrank a later activeFrom", () => {
    const backdated = target(
      "backdated",
      "2026-02-01T00:00:00.000Z",
      [],
      "2026-07-01T00:00:00.000Z",
    );
    const all = [...versions, backdated];

    expect(getActiveTarget(all, new Date("2026-07-01T00:00:00.000Z"))?.id).toBe(
      "v3",
    );
  });

  it("returns null when there is no target at all", () => {
    expect(
      getActiveTarget([], new Date("2026-04-15T00:00:00.000Z")),
    ).toBeNull();
  });
});

describe("monthlyTotal", () => {
  it("sums the lines into the total monthly contribution", () => {
    const plan = target("plan", "2026-01-01T00:00:00.000Z", [
      line("FTSE", "300"),
      line("EM", "75"),
      line("GOLD", "40"),
      line("ROBO", "30"),
      line("DEF", "30"),
      line("CLEAN", "25"),
    ]);

    expect(monthlyTotal(plan)).toBe("500");
  });

  it("adds fractional amounts without float drift", () => {
    const plan = target("plan", "2026-01-01T00:00:00.000Z", [
      line("A", "0.1"),
      line("B", "0.2"),
    ]);

    expect(monthlyTotal(plan)).toBe("0.3");
  });

  it("is zero for an empty target", () => {
    expect(monthlyTotal(target("empty", "2026-01-01T00:00:00.000Z", []))).toBe(
      "0",
    );
  });
});

describe("deriveTargetWeights", () => {
  it("derives each weight from its amount", () => {
    const plan = target("plan", "2026-01-01T00:00:00.000Z", [
      line("FTSE", "300"),
      line("EM", "75"),
      line("GOLD", "40"),
      line("ROBO", "30"),
      line("DEF", "30"),
      line("CLEAN", "25"),
    ]);

    expect(deriveTargetWeights(plan)).toEqual([
      { instrumentId: "FTSE", monthlyAmount: "300", weight: "0.6" },
      { instrumentId: "EM", monthlyAmount: "75", weight: "0.15" },
      { instrumentId: "GOLD", monthlyAmount: "40", weight: "0.08" },
      { instrumentId: "ROBO", monthlyAmount: "30", weight: "0.06" },
      { instrumentId: "DEF", monthlyAmount: "30", weight: "0.06" },
      { instrumentId: "CLEAN", monthlyAmount: "25", weight: "0.05" },
    ]);
  });

  it("yields no weights for an empty target", () => {
    expect(
      deriveTargetWeights(target("empty", "2026-01-01T00:00:00.000Z", [])),
    ).toEqual([]);
  });

  it("reports zero weights when nothing is contributed", () => {
    const plan = target("plan", "2026-01-01T00:00:00.000Z", [line("A", "0")]);

    expect(deriveTargetWeights(plan)).toEqual([
      { instrumentId: "A", monthlyAmount: "0", weight: "0" },
    ]);
  });
});

describe("findIdMismatches", () => {
  const known = ["IE00B3RBWM25", "BTC"];

  it("flags an id that matches an imported one only in case", () => {
    expect(
      findIdMismatches([line("ie00b3rbwm25", "300"), line("Btc", "75")], known),
    ).toEqual([
      { given: "ie00b3rbwm25", likely: "IE00B3RBWM25" },
      { given: "Btc", likely: "BTC" },
    ]);
  });

  it("says nothing about an id that resembles nothing imported", () => {
    expect(findIdMismatches([line("IE00NOTYET01", "300")], known)).toEqual([]);
  });

  it("says nothing when the id matches exactly", () => {
    expect(findIdMismatches([line("IE00B3RBWM25", "300")], known)).toEqual([]);
  });

  it("says nothing when nothing has been imported at all", () => {
    expect(findIdMismatches([line("ie00b3rbwm25", "300")], [])).toEqual([]);
  });
});

describe("parseTargetLines", () => {
  it("reads one instrument and amount per line", () => {
    const text = `# savings plan
IE00B3RBWM25 300
IE00BKM4GZ66,75

XS0000000001;40
`;

    expect(parseTargetLines(text)).toEqual([
      { instrumentId: "IE00B3RBWM25", monthlyAmount: "300" },
      { instrumentId: "IE00BKM4GZ66", monthlyAmount: "75" },
      { instrumentId: "XS0000000001", monthlyAmount: "40" },
    ]);
  });

  it("refuses an instrument named twice, which would split its weight", () => {
    expect(() => parseTargetLines("A 300\nA 100")).toThrow(TargetParseError);
  });

  it("refuses a non-positive amount", () => {
    expect(() => parseTargetLines("A 0")).toThrow(TargetParseError);
    expect(() => parseTargetLines("A -30")).toThrow(TargetParseError);
  });

  it("refuses a line that is not a pair", () => {
    expect(() => parseTargetLines("A")).toThrow(TargetParseError);
    expect(() => parseTargetLines("A 300 EUR")).toThrow(TargetParseError);
  });

  it("refuses an amount that is not a number", () => {
    expect(() => parseTargetLines("A cien")).toThrow(TargetParseError);
  });

  it("returns nothing for a file of comments and blanks", () => {
    expect(parseTargetLines("# nothing here\n\n")).toEqual([]);
  });
});
