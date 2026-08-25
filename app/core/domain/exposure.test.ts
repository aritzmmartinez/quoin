import { describe, expect, it } from "vitest";

import Decimal from "decimal.js";

import {
  canonicaliseLeaves,
  resolveWithHoldings,
  type FundHolding,
} from "./exposure";
import type { Instrument } from "./ledger";

const fund = (over: Partial<Instrument> = {}): Instrument => ({
  id: "IE00TEST0021",
  name: "Test World Equity",
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
      holding("US00TEST0022", "0.044503", "Acme Semiconductors"),
      holding("US00TEST0023", "0.039824", "Acme Devices"),
      holding("US00TEST0024", "0.915673", "Acme Software"),
    ]);
    expect(leaves).toHaveLength(3);
    expect(leaves[0]?.leaf).toEqual({ kind: "COMPANY", id: "US00TEST0022" });
    expect(sum(leaves)).toBe("1");
  });

  it("keeps the shortfall as the fund's own UNRESOLVED leaf", () => {
    const leaves = resolveWithHoldings(fund(), [
      holding("US00TEST0022", "0.10"),
      holding("US00TEST0023", "0.08"),
      holding("US00TEST0024", "0.04"),
    ]);
    expect(leaves).toHaveLength(4);
    const unresolved = leaves.find((l) => l.leaf.kind === "UNRESOLVED");
    expect(unresolved?.leaf.id).toBe("IE00TEST0021");
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
    const leaves = resolveWithHoldings(fund(), [
      holding("ACME", "0.5", "Acme Semiconductors"),
      holding("US00TEST0022", "0.5", "Acme Semiconductors"),
    ]);
    expect(leaves.map((l) => l.leaf.id)).toEqual(["ACME", "US00TEST0022"]);
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
        leaf: { kind: "UNRESOLVED", id: "IE00TEST0021" },
        name: "Test World Equity",
        weight: "1",
      },
    ]);
  });

  it("ignores holdings for anything that is not an equity fund", () => {
    const gold = fund({
      id: "XS00TEST0025",
      name: "Physical Gold",
      exposureKind: "COMMODITY",
      exposureLeafId: "XAU",
    });
    const leaves = resolveWithHoldings(gold, [holding("US00TEST0022", "1")]);
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
    const canonical = new Map([
      ["US00TEST0022", "BBG_TEST0001"],
      ["ACME.US", "BBG_TEST0001"],
    ]);
    const direct = canonicaliseLeaves(
      [company("US00TEST0022", "Acme Semiconductors")],
      canonical,
    );
    const viaFund = canonicaliseLeaves(
      [company("ACME.US", "Acme Semiconductors")],
      canonical,
    );

    expect(direct[0]?.leaf).toEqual(viaFund[0]?.leaf);
  });

  it("keeps the raw identity when nothing was resolved", () => {
    const leaves = canonicaliseLeaves([company("SAN.ES")], new Map());
    expect(leaves[0]?.leaf).toEqual({ kind: "COMPANY", id: "SAN.ES" });
  });

  it("preserves name and weight", () => {
    const canonical = new Map([["ACME.US", "BBG_TEST0001"]]);
    const [leaf] = canonicaliseLeaves(
      [company("ACME.US", "Acme Semiconductors", "0.044503")],
      canonical,
    );
    expect(leaf?.name).toBe("Acme Semiconductors");
    expect(leaf?.weight).toBe("0.044503");
  });

  it("leaves anything that is not a company alone", () => {
    const others = [
      {
        leaf: { kind: "COMMODITY" as const, id: "XAU" },
        name: "Gold",
        weight: "1",
      },
      {
        leaf: { kind: "CRYPTO" as const, id: "BTC" },
        name: "Bitcoin",
        weight: "1",
      },
      {
        leaf: { kind: "UNRESOLVED" as const, id: "IE00TEST0021" },
        name: "Test World Equity",
        weight: "1",
      },
    ];
    const canonical = new Map([
      ["XAU", "BBG_WRONG"],
      ["BTC", "BBG_WRONG"],
      ["IE00TEST0021", "BBG_WRONG"],
    ]);
    expect(canonicaliseLeaves(others, canonical)).toEqual(others);
  });

  it("is a no-op when the canonical id is the raw one", () => {
    const leaves = [company("BBG_TEST0001")];
    expect(
      canonicaliseLeaves(leaves, new Map([["BBG_TEST0001", "BBG_TEST0001"]])),
    ).toEqual(leaves);
  });

  it("handles an empty set", () => {
    expect(canonicaliseLeaves([], new Map())).toEqual([]);
  });
});
