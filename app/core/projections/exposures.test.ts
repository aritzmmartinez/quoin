import { describe, expect, it } from "vitest";

import {
  resolveIntrinsic,
  type Instrument,
  type WeightedLeaf,
} from "../domain";
import {
  computeExposures,
  leafTotal,
  leafWeight,
  summarizeExposures,
} from "./exposures";
import type { MarketValue } from "./market-value";
import type { Position } from "./positions";
import { tradeMetaKey } from "./trade-meta";

const instrument = (over: Partial<Instrument> = {}): Instrument => ({
  id: "IE00BK5BQT80",
  name: "FTSE All-World",
  type: "ETF",
  currency: "EUR",
  assetClass: "FUND",
  quoteSymbol: null,
  exposureKind: null,
  exposureLeafId: null,
  ...over,
});

const position = (id: string, qty = "10"): Position =>
  ({
    instrumentId: id,
    sleeve: "CORE",
    quantity: qty,
    costBasis: "100",
    realizedPnL: "0",
  }) as Position;

const priced = (id: string, value: string | null): [string, MarketValue] => [
  tradeMetaKey(id, "CORE"),
  { marketValue: value } as MarketValue,
];

const direct = (
  id: string,
  name: string,
  kind: "COMPANY" | "COMMODITY" | "CRYPTO" | "UNRESOLVED",
): WeightedLeaf[] => [{ leaf: { kind, id }, name, weight: "1" }];

describe("resolveIntrinsic", () => {
  it("resolves a stock to itself", () => {
    const [leaf] = resolveIntrinsic(
      instrument({ id: "US67066G1040", name: "NVIDIA", type: "STOCK" }),
    );
    expect(leaf?.leaf).toEqual({ kind: "COMPANY", id: "US67066G1040" });
    expect(leaf?.weight).toBe("1");
  });

  it("resolves crypto to itself", () => {
    const [leaf] = resolveIntrinsic(instrument({ id: "BTC", type: "CRYPTO" }));
    expect(leaf?.leaf).toEqual({ kind: "CRYPTO", id: "BTC" });
  });

  it("leaves an unmapped fund unresolved rather than guessing", () => {
    const [leaf] = resolveIntrinsic(instrument());
    expect(leaf?.leaf.kind).toBe("UNRESOLVED");
  });

  it("maps a gold ETC that TR reported as a plain ETF", () => {
    const [leaf] = resolveIntrinsic(
      instrument({
        id: "XS2183935274",
        name: "Invesco Physical Gold",
        type: "ETF",
        exposureKind: "COMMODITY",
        exposureLeafId: "XAU",
      }),
    );
    expect(leaf?.leaf).toEqual({ kind: "COMMODITY", id: "XAU" });
  });

  it("keeps a bond fund unresolved: there is no holdings source", () => {
    const [leaf] = resolveIntrinsic(
      instrument({ id: "IE00BGYWT403", exposureKind: "BOND_FUND" }),
    );
    expect(leaf?.leaf).toEqual({ kind: "UNRESOLVED", id: "IE00BGYWT403" });
  });

  it("keeps an equity fund unresolved until holdings exist", () => {
    const [leaf] = resolveIntrinsic(
      instrument({ exposureKind: "EQUITY_FUND" }),
    );
    expect(leaf?.leaf.kind).toBe("UNRESOLVED");
  });

  it("lets an explicit mapping override the type default", () => {
    const [leaf] = resolveIntrinsic(
      instrument({
        id: "X",
        type: "STOCK",
        exposureKind: "COMMODITY",
        exposureLeafId: "XAG",
      }),
    );
    expect(leaf?.leaf).toEqual({ kind: "COMMODITY", id: "XAG" });
  });

  it("always produces weights summing to 1", () => {
    for (const kind of [
      "COMPANY",
      "COMMODITY",
      "CRYPTO",
      "BOND_FUND",
      "EQUITY_FUND",
    ] as const) {
      const leaves = resolveIntrinsic(
        instrument({ exposureKind: kind, exposureLeafId: "L" }),
      );
      const sum = leaves.reduce((s, l) => s + Number(l.weight), 0);
      expect(sum).toBe(1);
    }
  });
});

describe("computeExposures", () => {
  it("merges a leaf reached by several routes and keeps each route", () => {
    const exposures = computeExposures(
      [position("NVDA"), position("FTSE")],
      new Map([priced("NVDA", "1250.00"), priced("FTSE", "3900.00")]),
      new Map<string, WeightedLeaf[]>([
        ["NVDA", direct("US67066G1040", "NVIDIA", "COMPANY")],
        [
          "FTSE",
          [
            {
              leaf: { kind: "COMPANY", id: "US67066G1040" },
              name: "NVIDIA",
              weight: "0.045",
            },
          ],
        ],
      ]),
      new Map([
        ["NVDA", "NVIDIA"],
        ["FTSE", "Vanguard FTSE All-World"],
      ]),
    );

    expect(exposures).toHaveLength(1);
    const nvidia = exposures[0]!;
    expect(leafTotal(nvidia)).toBe("1425.5");
    expect(nvidia.name).toBe("NVIDIA");
    expect(nvidia.contributions).toEqual([
      {
        instrumentId: "NVDA",
        instrumentName: "NVIDIA",
        value: "1250.00",
        weightInParent: null,
      },
      {
        instrumentId: "FTSE",
        instrumentName: "Vanguard FTSE All-World",
        value: "175.50",
        weightInParent: "0.045",
      },
    ]);
  });

  it("names a constituent's contribution after the fund, not the company", () => {
    const [exposure] = computeExposures(
      [position("FTSE")],
      new Map([priced("FTSE", "3900.00")]),
      new Map<string, WeightedLeaf[]>([
        [
          "FTSE",
          [
            {
              leaf: { kind: "COMPANY", id: "US67066G1040" },
              name: "NVIDIA Corp",
              weight: "0.045",
            },
          ],
        ],
      ]),
      new Map([["FTSE", "Vanguard FTSE All-World"]]),
    );

    expect(exposure?.name).toBe("NVIDIA Corp");
    expect(exposure?.contributions).toEqual([
      {
        instrumentId: "FTSE",
        instrumentName: "Vanguard FTSE All-World",
        value: "175.50",
        weightInParent: "0.045",
      },
    ]);
  });

  it("marks a direct holding with a null weight, not a weight of 1", () => {
    const [exposure] = computeExposures(
      [position("GOLD")],
      new Map([priced("GOLD", "950.00")]),
      new Map([["GOLD", direct("XAU", "Invesco Physical Gold", "COMMODITY")]]),
    );
    expect(exposure?.contributions[0]?.weightInParent).toBeNull();
  });

  it("keeps commodity and crypto apart from companies", () => {
    const exposures = computeExposures(
      [position("GOLD"), position("BTC")],
      new Map([priced("GOLD", "950.00"), priced("BTC", "700.00")]),
      new Map([
        ["GOLD", direct("XAU", "Oro", "COMMODITY")],
        ["BTC", direct("BTC", "Bitcoin", "CRYPTO")],
      ]),
    );
    expect(exposures.map((e) => e.leaf)).toEqual([
      { kind: "COMMODITY", id: "XAU" },
      { kind: "CRYPTO", id: "BTC" },
    ]);
  });

  it("sorts by total, descending", () => {
    const exposures = computeExposures(
      [position("A"), position("B"), position("C")],
      new Map([priced("A", "100"), priced("B", "900"), priced("C", "500")]),
      new Map([
        ["A", direct("a", "A", "COMPANY")],
        ["B", direct("b", "B", "COMPANY")],
        ["C", direct("c", "C", "COMPANY")],
      ]),
    );
    expect(exposures.map((e) => e.leaf.id)).toEqual(["b", "c", "a"]);
  });

  it("skips unpriced positions rather than valuing them at zero", () => {
    const exposures = computeExposures(
      [position("A")],
      new Map([priced("A", null)]),
      new Map([["A", direct("a", "A", "COMPANY")]]),
    );
    expect(exposures).toEqual([]);
  });

  it("skips closed positions", () => {
    const exposures = computeExposures(
      [position("A", "0")],
      new Map([priced("A", "100")]),
      new Map([["A", direct("a", "A", "COMPANY")]]),
    );
    expect(exposures).toEqual([]);
  });

  it("skips an instrument with no resolution instead of throwing", () => {
    const exposures = computeExposures(
      [position("A")],
      new Map([priced("A", "100")]),
      new Map(),
    );
    expect(exposures).toEqual([]);
  });
});

describe("summarizeExposures", () => {
  const exposures = computeExposures(
    [position("NVDA"), position("FTSE"), position("BONDS")],
    new Map([
      priced("NVDA", "1250.00"),
      priced("FTSE", "3900.00"),
      priced("BONDS", "2464.00"),
    ]),
    new Map([
      ["NVDA", direct("US67066G1040", "NVIDIA", "COMPANY")],
      ["FTSE", direct("IE00BK5BQT80", "FTSE All-World", "UNRESOLVED")],
      ["BONDS", direct("IE00BGYWT403", "Bonos", "UNRESOLVED")],
    ]),
  );

  it("reports unresolved value instead of hiding or spreading it", () => {
    const summary = summarizeExposures(exposures);
    expect(summary.total).toBe("7614");
    expect(summary.unresolved).toBe("6364");
    expect(summary.resolvedLeafCount).toBe(1);
  });

  it("is empty-safe", () => {
    expect(summarizeExposures([])).toEqual({
      total: "0",
      unresolved: "0",
      resolvedLeafCount: 0,
    });
  });
});

describe("leafWeight", () => {
  const [exposure] = computeExposures(
    [position("A")],
    new Map([priced("A", "1250.00")]),
    new Map([["A", direct("a", "A", "COMPANY")]]),
  );

  it("divides by the given total", () => {
    expect(leafWeight(exposure!, "12560")).toBe("0.099522");
  });

  it("returns null rather than dividing by zero", () => {
    expect(leafWeight(exposure!, "0")).toBeNull();
  });
});

describe("naming a leaf that several instruments reach", () => {
  const leaf = { kind: "COMPANY" as const, id: "BBG001S5TZJ6" };

  it("prefers the directly held position's name", () => {
    // Once identities merge, the broker's "NVIDIA" and an issuer's "NVIDIA Corp"
    // compete for one leaf. Without a rule the winner is whichever instrument
    // happened to be iterated first, which is not a rule.
    const exposures = computeExposures(
      [position("FUND"), position("US67066G1040")],
      new Map([priced("FUND", "1000"), priced("US67066G1040", "1200")]),
      new Map<string, WeightedLeaf[]>([
        ["FUND", [{ leaf, name: "NVIDIA Corp", weight: "0.05" }]],
        ["US67066G1040", [{ leaf, name: "NVIDIA", weight: "1" }]],
      ]),
    );

    expect(exposures).toHaveLength(1);
    expect(exposures[0]?.name).toBe("NVIDIA");
    expect(exposures[0]?.contributions).toHaveLength(2);
  });

  it("keeps both routes visible after the merge", () => {
    // The merged number is not the point; "9.7% direct, 1.6% via the fund" is.
    const exposures = computeExposures(
      [position("FUND"), position("US67066G1040")],
      new Map([priced("FUND", "1000"), priced("US67066G1040", "1200")]),
      new Map<string, WeightedLeaf[]>([
        ["FUND", [{ leaf, name: "NVIDIA Corp", weight: "0.05" }]],
        ["US67066G1040", [{ leaf, name: "NVIDIA", weight: "1" }]],
      ]),
    );

    const routes = exposures[0]?.contributions ?? [];
    expect(routes.filter((c) => c.weightInParent === null)).toHaveLength(1);
    expect(routes.filter((c) => c.weightInParent !== null)).toHaveLength(1);
    expect(leafTotal(exposures[0]!)).toBe("1250");
  });

  it("falls back to the issuer's name when nothing is held directly", () => {
    const exposures = computeExposures(
      [position("FUND")],
      new Map([priced("FUND", "1000")]),
      new Map<string, WeightedLeaf[]>([
        ["FUND", [{ leaf, name: "NVIDIA Corp", weight: "0.05" }]],
      ]),
    );
    expect(exposures[0]?.name).toBe("NVIDIA Corp");
  });
});
