import { describe, expect, it } from "vitest";

import Decimal from "decimal.js";

import {
  canonicaliseLeaves,
  resolveWithHoldings,
  type FundHolding,
} from "./exposure";
import type { Instrument } from "./ledger";

const fund = (over: Partial<Instrument> = {}): Instrument => ({
  id: "IE00BK5BQT80",
  name: "FTSE All-World",
  type: "ETF",
  currency: "EUR",
  assetClass: "FUND",
  quoteSymbol: null,
  exposureKind: "EQUITY_FUND",
  exposureLeafId: null,
  ...over,
});

const holding = (
  identity: string,
  weight: string,
  name = identity,
): FundHolding => ({
  identity,
  name,
  weight,
});

const sum = (leaves: { weight: string }[]): string =>
  leaves
    .reduce((acc, l) => acc.plus(new Decimal(l.weight)), new Decimal(0))
    .toString();

describe("resolveWithHoldings", () => {
  it("expands a fund into its constituents", () => {
    const leaves = resolveWithHoldings(fund(), [
      holding("US67066G1040", "0.044503", "NVIDIA Corp"),
      holding("US0378331005", "0.039824", "Apple Inc"),
      holding("US5949181045", "0.915673", "Microsoft Corp"),
    ]);
    expect(leaves).toHaveLength(3);
    expect(leaves[0]?.leaf).toEqual({ kind: "COMPANY", id: "US67066G1040" });
    expect(sum(leaves)).toBe("1");
  });

  it("keeps the shortfall as the fund's own UNRESOLVED leaf", () => {
    // A fund published with only its top three: the other 78% is unknown, and
    // saying so beats pro-rating it across the three we happen to know.
    const leaves = resolveWithHoldings(fund(), [
      holding("US67066G1040", "0.10"),
      holding("US0378331005", "0.08"),
      holding("US5949181045", "0.04"),
    ]);
    expect(leaves).toHaveLength(4);
    const unresolved = leaves.find((l) => l.leaf.kind === "UNRESOLVED");
    expect(unresolved?.leaf.id).toBe("IE00BK5BQT80");
    expect(unresolved?.weight).toBe("0.78");
  });

  it("always produces weights summing to exactly 1", () => {
    for (const holdings of [
      [holding("A", "0.5"), holding("B", "0.5")],
      [holding("A", "0.1")],
      [
        holding("A", "0.333333"),
        holding("B", "0.333333"),
        holding("C", "0.333333"),
      ],
    ]) {
      expect(sum(resolveWithHoldings(fund(), holdings))).toBe("1");
    }
  });

  it("carries a negative residual rather than hiding that a fund is geared", () => {
    const leaves = resolveWithHoldings(fund(), [
      holding("A", "0.6015"),
      holding("B", "0.4043"),
    ]);
    expect(leaves.find((l) => l.leaf.kind === "UNRESOLVED")?.weight).toBe(
      "-0.0058",
    );
    expect(sum(leaves)).toBe("1");
  });

  it("adds no leaf when the holdings account for everything", () => {
    const leaves = resolveWithHoldings(fund(), [
      holding("A", "0.5"),
      holding("B", "0.5"),
    ]);
    expect(leaves.every((l) => l.leaf.kind === "COMPANY")).toBe(true);
  });

  it("keeps a ticker and an ISIN as separate leaves until a human says otherwise", () => {
    // Vanguard publishes "NVDA"; the direct position is US67066G1040. No parser
    // can know they are the same company, and guessing by name fails silently.
    const leaves = resolveWithHoldings(fund(), [
      holding("NVDA", "0.5", "NVIDIA Corp"),
      holding("US67066G1040", "0.5", "NVIDIA Corp"),
    ]);
    expect(leaves.map((l) => l.leaf.id)).toEqual(["NVDA", "US67066G1040"]);
  });

  it("drops a zero or negative constituent from the leaves", () => {
    const leaves = resolveWithHoldings(fund(), [
      holding("A", "0.9"),
      holding("CASH", "-0.02"),
      holding("B", "0"),
    ]);
    expect(leaves.filter((l) => l.leaf.kind === "COMPANY")).toHaveLength(1);
    expect(sum(leaves)).toBe("1");
  });

  it("falls back to intrinsic resolution for a fund with no holdings yet", () => {
    const leaves = resolveWithHoldings(fund(), []);
    expect(leaves).toEqual([
      {
        leaf: { kind: "UNRESOLVED", id: "IE00BK5BQT80" },
        name: "FTSE All-World",
        weight: "1",
      },
    ]);
  });

  it("ignores holdings for anything that is not an equity fund", () => {
    // Someone dropping a CSV on the gold ETC must not turn bullion into equities.
    const gold = fund({
      id: "XS2183935274",
      name: "Physical Gold",
      exposureKind: "COMMODITY",
      exposureLeafId: "XAU",
    });
    const leaves = resolveWithHoldings(gold, [holding("US67066G1040", "1")]);
    expect(leaves[0]?.leaf).toEqual({ kind: "COMMODITY", id: "XAU" });
  });

  it("ignores holdings on a bond fund, which has no source to trust", () => {
    const bonds = fund({ id: "IE00BGYWT403", exposureKind: "BOND_FUND" });
    const leaves = resolveWithHoldings(bonds, [holding("A", "1")]);
    expect(leaves[0]?.leaf.kind).toBe("UNRESOLVED");
  });
});

describe("canonicaliseLeaves", () => {
  const company = (id: string, name = id, weight = "1") => ({
    leaf: { kind: "COMPANY" as const, id },
    name,
    weight,
  });

  it("brings an ISIN and a ticker to the same leaf", () => {
    // The whole point: a direct position published as an ISIN and the same
    // company inside a fund published as a ticker stop being two leaves.
    const canonical = new Map([
      ["US67066G1040", "BBG001S5TZJ6"],
      ["NVDA.US", "BBG001S5TZJ6"],
    ]);
    const direct = canonicaliseLeaves([company("US67066G1040", "NVIDIA")], canonical);
    const viaFund = canonicaliseLeaves([company("NVDA.US", "NVIDIA Corp")], canonical);

    expect(direct[0]?.leaf).toEqual(viaFund[0]?.leaf);
  });

  it("keeps the raw identity when nothing was resolved", () => {
    // Degrading is the safe failure: the leaf still carries its value, it just
    // does not merge.
    const leaves = canonicaliseLeaves([company("SAN.ES")], new Map());
    expect(leaves[0]?.leaf).toEqual({ kind: "COMPANY", id: "SAN.ES" });
  });

  it("preserves name and weight", () => {
    const canonical = new Map([["NVDA.US", "BBG001S5TZJ6"]]);
    const [leaf] = canonicaliseLeaves(
      [company("NVDA.US", "NVIDIA Corp", "0.044503")],
      canonical,
    );
    expect(leaf?.name).toBe("NVIDIA Corp");
    expect(leaf?.weight).toBe("0.044503");
  });

  it("leaves anything that is not a company alone", () => {
    // Gold has no share class. Mapping these through would silently merge
    // distinct things if an id ever collided with a company's.
    const others = [
      { leaf: { kind: "COMMODITY" as const, id: "XAU" }, name: "Gold", weight: "1" },
      { leaf: { kind: "CRYPTO" as const, id: "BTC" }, name: "Bitcoin", weight: "1" },
      {
        leaf: { kind: "UNRESOLVED" as const, id: "IE00BK5BQT80" },
        name: "FTSE",
        weight: "1",
      },
    ];
    const canonical = new Map([
      ["XAU", "BBG_WRONG"],
      ["BTC", "BBG_WRONG"],
      ["IE00BK5BQT80", "BBG_WRONG"],
    ]);
    expect(canonicaliseLeaves(others, canonical)).toEqual(others);
  });

  it("is a no-op when the canonical id is the raw one", () => {
    const leaves = [company("BBG001S5TZJ6")];
    expect(canonicaliseLeaves(leaves, new Map([["BBG001S5TZJ6", "BBG001S5TZJ6"]]))).toEqual(
      leaves,
    );
  });

  it("handles an empty set", () => {
    expect(canonicaliseLeaves([], new Map())).toEqual([]);
  });
});
