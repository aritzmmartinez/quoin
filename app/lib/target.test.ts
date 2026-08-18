import { describe, expect, it } from "vitest";

import type { Instrument, PortfolioTarget } from "~/core/domain";

import { toTargetRows, toTargetVersionRows } from "./target";

const instrument = (id: string, name: string): Instrument => ({
  id,
  name,
  type: "ETF",
  currency: "EUR",
  assetClass: null,
  quoteSymbol: null,
  exposureKind: null,
  exposureLeafId: null,
});

const plan: PortfolioTarget = {
  id: "v1",
  name: "Savings plan",
  activeFrom: new Date("2026-01-01T00:00:00.000Z"),
  note: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  lines: [
    { instrumentId: "HELD", monthlyAmount: "300" },
    { instrumentId: "KNOWN_NOT_HELD", monthlyAmount: "75" },
    { instrumentId: "NEVER_BOUGHT", monthlyAmount: "125" },
  ],
};

const instruments = new Map([
  ["HELD", instrument("HELD", "World ETF")],
  ["KNOWN_NOT_HELD", instrument("KNOWN_NOT_HELD", "Sold-out ETF")],
]);

describe("toTargetRows", () => {
  it("keeps a line whose instrument has no position, with its full weight", () => {
    const rows = toTargetRows(plan, instruments, new Set(["HELD"]));

    expect(rows).toEqual([
      {
        instrumentId: "HELD",
        name: "World ETF",
        monthlyAmount: "300",
        weight: "0.6",
        held: true,
        known: true,
      },
      {
        instrumentId: "KNOWN_NOT_HELD",
        name: "Sold-out ETF",
        monthlyAmount: "75",
        weight: "0.15",
        held: false,
        known: true,
      },
      {
        instrumentId: "NEVER_BOUGHT",
        name: "NEVER_BOUGHT",
        monthlyAmount: "125",
        weight: "0.25",
        held: false,
        known: false,
      },
    ]);
  });

  it("treats everything as unheld when no positions are supplied", () => {
    expect(toTargetRows(plan, instruments).every((row) => !row.held)).toBe(
      true,
    );
  });

  it("returns no rows for an empty target", () => {
    expect(toTargetRows({ ...plan, lines: [] }, instruments)).toEqual([]);
  });
});

describe("toTargetVersionRows", () => {
  it("lists versions newest first and flags the active one", () => {
    const older: PortfolioTarget = {
      ...plan,
      id: "v0",
      activeFrom: new Date("2025-06-01T00:00:00.000Z"),
      lines: [{ instrumentId: "HELD", monthlyAmount: "250" }],
    };

    expect(toTargetVersionRows([older, plan], "v1")).toEqual([
      {
        id: "v1",
        name: "Savings plan",
        activeFrom: "2026-01-01T00:00:00.000Z",
        note: null,
        monthlyTotal: "500",
        lineCount: 3,
        isActive: true,
      },
      {
        id: "v0",
        name: "Savings plan",
        activeFrom: "2025-06-01T00:00:00.000Z",
        note: null,
        monthlyTotal: "250",
        lineCount: 1,
        isActive: false,
      },
    ]);
  });
});
