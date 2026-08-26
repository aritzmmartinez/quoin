import { describe, expect, it } from "vitest";

import type { LeafKind, WeightedLeaf } from "../domain";
import { computeAllFundOverlaps, computeFundOverlap } from "./fund-overlap";

const fund = (entries: [string, string, LeafKind?][]): WeightedLeaf[] =>
  entries.map(([id, weight, kind = "COMPANY"]) => ({
    leaf: { kind, id },
    name: id,
    weight,
  }));

describe("computeFundOverlap", () => {
  it("sums the smaller weight of every company both funds hold", () => {
    const result = computeFundOverlap(
      fund([
        ["AAPL", "0.30"],
        ["MSFT", "0.20"],
        ["NVDA", "0.10"],
        ["SAP", "0.40"],
      ]),
      fund([
        ["AAPL", "0.10"],
        ["MSFT", "0.25"],
        ["NVDA", "0.15"],
        ["ASML", "0.50"],
      ]),
    );

    expect(result.overlap).toBe("0.400000");
    expect(result.shared).toBe(3);
    expect(result.contributors.map((c) => c.name)).toEqual([
      "MSFT",
      "AAPL",
      "NVDA",
    ]);
    expect(result.contributors[0]).toMatchObject({
      weight: "0.200000",
      weightA: "0.200000",
      weightB: "0.250000",
    });
  });

  it("returns an exact zero when nothing is shared, never NaN", () => {
    const result = computeFundOverlap(
      fund([
        ["AAPL", "0.50"],
        ["MSFT", "0.50"],
      ]),
      fund([
        ["SAP", "0.60"],
        ["ASML", "0.40"],
      ]),
    );

    expect(result.overlap).toBe("0.000000");
    expect(result.shared).toBe(0);
    expect(result.contributors).toEqual([]);
  });

  it("reaches 1 for two identical compositions", () => {
    const composition = fund([
      ["AAPL", "0.30"],
      ["MSFT", "0.70"],
    ]);

    expect(computeFundOverlap(composition, composition).overlap).toBe(
      "1.000000",
    );
  });

  it("never crosses an unresolved residual", () => {
    const result = computeFundOverlap(
      fund([
        ["AAPL", "0.60"],
        ["RESIDUAL", "0.40", "UNRESOLVED"],
      ]),
      fund([
        ["AAPL", "0.50"],
        ["RESIDUAL", "0.50", "UNRESOLVED"],
      ]),
    );

    expect(result.overlap).toBe("0.500000");
    expect(result.contributors.map((c) => c.name)).toEqual(["AAPL"]);
  });

  it("folds two rows landing on one leaf before comparing", () => {
    const result = computeFundOverlap(
      fund([
        ["AAPL", "0.20"],
        ["AAPL", "0.15"],
      ]),
      fund([["AAPL", "0.30"]]),
    );

    expect(result.overlap).toBe("0.300000");
    expect(result.contributors[0]?.weightA).toBe("0.350000");
  });

  it("ignores zero and negative weights", () => {
    const result = computeFundOverlap(
      fund([
        ["AAPL", "0.50"],
        ["CASH", "-0.10"],
        ["MSFT", "0"],
      ]),
      fund([
        ["AAPL", "0.40"],
        ["CASH", "-0.20"],
        ["MSFT", "0.30"],
      ]),
    );

    expect(result.overlap).toBe("0.400000");
    expect(result.shared).toBe(1);
  });

  it("keeps cash out of the contributors without moving the figure", () => {
    const isCash = (id: string) => ["JPY", "TWD", "GBP"].includes(id);
    const a = fund([
      ["JPY", "0.30"],
      ["AAPL", "0.20"],
      ["TWD", "0.50"],
    ]);
    const b = fund([
      ["JPY", "0.40"],
      ["AAPL", "0.10"],
      ["TWD", "0.50"],
    ]);

    const plain = computeFundOverlap(a, b);
    const filtered = computeFundOverlap(a, b, isCash);

    expect(filtered.overlap).toBe(plain.overlap);
    expect(filtered.shared).toBe(plain.shared);
    expect(plain.contributors.map((c) => c.name)).toEqual([
      "TWD",
      "JPY",
      "AAPL",
    ]);
    expect(filtered.contributors.map((c) => c.name)).toEqual(["AAPL"]);
  });

  it("filters cash before the cut, so it cannot push a company off the list", () => {
    const cash = ["USD", "JPY", "GBP", "CHF", "SEK"];
    const entries: [string, string][] = [
      ...cash.map((code): [string, string] => [code, "0.10"]),
      ["AAPL", "0.05"],
    ];

    const result = computeFundOverlap(fund(entries), fund(entries), (id) =>
      cash.includes(id),
    );

    expect(result.contributors.map((c) => c.name)).toEqual(["AAPL"]);
  });

  it("keeps at most MAX_CONTRIBUTORS but counts every crossing company", () => {
    const shared = Array.from({ length: 8 }, (_, i): [string, string] => [
      `C${i}`,
      "0.10",
    ]);
    const result = computeFundOverlap(fund(shared), fund(shared));

    expect(result.shared).toBe(8);
    expect(result.contributors).toHaveLength(5);
  });
});

describe("computeAllFundOverlaps", () => {
  it("produces n·(n-1)/2 pairs and never a fund against itself", () => {
    const funds = new Map<string, WeightedLeaf[]>(
      ["F1", "F2", "F3", "F4"].map((id) => [id, fund([["AAPL", "0.10"]])]),
    );

    const pairs = computeAllFundOverlaps(funds);

    expect(pairs).toHaveLength(6);
    expect(pairs.some((p) => p.a === p.b)).toBe(false);
    expect(new Set(pairs.map((p) => [p.a, p.b].sort().join("|"))).size).toBe(6);
  });

  it("orders the pairs by overlap, largest first", () => {
    const pairs = computeAllFundOverlaps(
      new Map<string, WeightedLeaf[]>([
        ["F1", fund([["AAPL", "1"]])],
        [
          "F2",
          fund([
            ["AAPL", "0.5"],
            ["SAP", "0.5"],
          ]),
        ],
        ["F3", fund([["SAP", "1"]])],
      ]),
    );

    expect(pairs.map((p) => [p.a, p.b, p.overlap])).toEqual([
      ["F1", "F2", "0.500000"],
      ["F2", "F3", "0.500000"],
      ["F1", "F3", "0.000000"],
    ]);
  });

  it("has nothing to pair below two funds", () => {
    expect(computeAllFundOverlaps(new Map())).toEqual([]);
    expect(
      computeAllFundOverlaps(new Map([["F1", fund([["AAPL", "1"]])]])),
    ).toEqual([]);
  });
});
