import { describe, expect, it } from "vitest";

import type { RealizedSale } from "~/core/projections";

import {
  groupRealizedByYear,
  nextRealizedSort,
  parseRealizedSort,
  realizedTotals,
  sortRealizedRows,
  toRealizedRows,
  type RealizedRow,
} from "./realized";

function sale(overrides: Partial<RealizedSale> = {}): RealizedSale {
  return {
    eventId: "evt-1",
    ts: new Date("2025-03-01T10:00:00"),
    instrumentId: "X",
    sleeve: "CORE",
    quantity: "5",
    price: "120",
    grossAmount: "600",
    fees: "1",
    costBasis: "500",
    realizedPnL: "99",
    returnPct: "0.198000",
    holdingDays: 40,
    ...overrides,
  };
}

function row(overrides: Partial<RealizedRow> = {}): RealizedRow {
  return { ...toRealizedRows([sale()], [])[0]!, ...overrides };
}

describe("toRealizedRows", () => {
  it("resolves the instrument name and falls back to its id", () => {
    const instruments = [
      {
        id: "X",
        name: "Fondo Global",
        type: "ETF" as const,
        currency: "EUR",
      },
    ];
    const rows = toRealizedRows(
      [sale(), sale({ eventId: "evt-2", instrumentId: "Y" })],
      instruments,
    );

    expect(rows[0]!.name).toBe("Fondo Global");
    expect(rows[1]!.name).toBe("Y");
  });

  it("derives the calendar year from the sale date", () => {
    const rows = toRealizedRows(
      [sale({ ts: new Date("2024-12-31T23:00:00") })],
      [],
    );
    expect(rows[0]!.year).toBe(2024);
  });
});

describe("realized sort", () => {
  it("falls back to the newest-first default and rejects unknown keys", () => {
    expect(parseRealizedSort(new URLSearchParams())).toEqual({
      key: "date",
      dir: "desc",
    });
    expect(parseRealizedSort(new URLSearchParams("sort=bogus"))).toEqual({
      key: "date",
      dir: "desc",
    });
    expect(parseRealizedSort(new URLSearchParams("sort=name"))).toEqual({
      key: "name",
      dir: "asc",
    });
  });

  it("toggles the active column and adopts the default direction on a new one", () => {
    const current = { key: "date", dir: "desc" } as const;
    expect(nextRealizedSort("date", current)).toEqual({
      key: "date",
      dir: "asc",
    });
    expect(nextRealizedSort("realizedPnL", current)).toEqual({
      key: "realizedPnL",
      dir: "desc",
    });
  });

  it("orders by decimal magnitude, not lexicographically", () => {
    const rows = [
      row({ id: "a", realizedPnL: "9" }),
      row({ id: "b", realizedPnL: "100" }),
      row({ id: "c", realizedPnL: "-20" }),
    ];
    expect(
      sortRealizedRows(rows, { key: "realizedPnL", dir: "desc" }).map(
        (r) => r.id,
      ),
    ).toEqual(["b", "a", "c"]);
  });

  it("keeps rows with no return at the bottom in both directions", () => {
    const rows = [
      row({ id: "a", returnPct: null }),
      row({ id: "b", returnPct: "0.5" }),
      row({ id: "c", returnPct: "0.1" }),
    ];
    expect(
      sortRealizedRows(rows, { key: "returnPct", dir: "desc" }).map(
        (r) => r.id,
      ),
    ).toEqual(["b", "c", "a"]);
    expect(
      sortRealizedRows(rows, { key: "returnPct", dir: "asc" }).map((r) => r.id),
    ).toEqual(["c", "b", "a"]);
  });
});

describe("realizedTotals", () => {
  it("recomputes the return from the totals instead of averaging the rows", () => {
    const totals = realizedTotals([
      row({ id: "a", costBasis: "50", realizedPnL: "100" }), // +200 %
      row({ id: "b", costBasis: "50000", realizedPnL: "500" }), // +1 %
    ]);

    expect(totals.count).toBe(2);
    expect(totals.costBasis).toBe("50050.00");
    expect(totals.realizedPnL).toBe("600.00");
    expect(totals.returnPct).toBe("0.011988"); // not the 100.5 % of an average
  });

  it("reports no return when nothing was consumed", () => {
    expect(realizedTotals([row({ costBasis: "0" })]).returnPct).toBeNull();
    expect(realizedTotals([]).returnPct).toBeNull();
  });
});

describe("groupRealizedByYear", () => {
  const rows = [
    row({
      id: "a",
      t: "2024-05-01T00:00:00.000Z",
      year: 2024,
      realizedPnL: "10",
    }),
    row({
      id: "b",
      t: "2025-02-01T00:00:00.000Z",
      year: 2025,
      realizedPnL: "30",
    }),
    row({
      id: "c",
      t: "2025-07-01T00:00:00.000Z",
      year: 2025,
      realizedPnL: "20",
    }),
  ];

  it("reads most recent year first and sorts inside each year", () => {
    const groups = groupRealizedByYear(rows, {
      key: "realizedPnL",
      dir: "desc",
    });

    expect(groups.map((g) => g.year)).toEqual([2025, 2024]);
    expect(groups[0]!.rows.map((r) => r.id)).toEqual(["b", "c"]);
    expect(groups[0]!.totals.realizedPnL).toBe("50.00");
    expect(groups[1]!.totals.count).toBe(1);
  });

  it("flips the year order only when sorting by date ascending", () => {
    expect(
      groupRealizedByYear(rows, { key: "date", dir: "asc" }).map((g) => g.year),
    ).toEqual([2024, 2025]);
    expect(
      groupRealizedByYear(rows, { key: "name", dir: "asc" }).map((g) => g.year),
    ).toEqual([2025, 2024]);
  });

  it("year totals add up to the global total", () => {
    const groups = groupRealizedByYear(rows, { key: "date", dir: "desc" });
    const summed = groups.reduce(
      (total, group) => total + Number(group.totals.realizedPnL),
      0,
    );
    expect(summed).toBe(Number(realizedTotals(rows).realizedPnL));
  });
});
