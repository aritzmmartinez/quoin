import { describe, expect, it } from "vitest";

import type { Instrument } from "~/core/domain";
import type { Position, TradeMeta } from "~/core/projections";
import { tradeMetaKey } from "~/core/projections";

import {
  DEFAULT_SORT,
  nextSort,
  parseSort,
  sortPortfolioRows,
  toPortfolioRows,
  totalInvested,
  type PortfolioRow,
} from "./portfolio";

const instruments: Instrument[] = [
  {
    id: "IE00BK5BQT80",
    name: "Vanguard FTSE All-World",
    type: "ETF",
    currency: "EUR",
  },
  { id: "NL0010273215", name: "ASML Holding", type: "STOCK", currency: "EUR" },
  { id: "BTC", name: "Bitcoin", type: "CRYPTO", currency: "EUR" },
];

function position(
  overrides: Partial<Position> & Pick<Position, "instrumentId">,
): Position {
  return {
    sleeve: "CORE",
    quantity: "10",
    costBasis: "1000",
    averageCost: "100",
    realizedPnL: "0",
    ...overrides,
  };
}

const meta = new Map<string, TradeMeta>([
  [
    tradeMetaKey("IE00BK5BQT80", "CORE"),
    {
      firstTradeAt: new Date("2026-01-01"),
      lastTradeAt: new Date("2026-06-01"),
      tradeCount: 3,
    },
  ],
]);

describe("toPortfolioRows", () => {
  it("joins position, instrument and trade meta", () => {
    const rows = toPortfolioRows(
      [position({ instrumentId: "IE00BK5BQT80" })],
      instruments,
      meta,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Vanguard FTSE All-World",
      type: "ETF",
      currency: "EUR",
      tradeCount: 3,
      firstTradeAt: new Date("2026-01-01").toISOString(),
    });
  });

  it("excludes closed positions (quantity 0)", () => {
    const rows = toPortfolioRows(
      [
        position({ instrumentId: "IE00BK5BQT80" }),
        position({
          instrumentId: "NL0010273215",
          quantity: "0",
          costBasis: "0",
        }),
      ],
      instruments,
      meta,
    );
    expect(rows.map((r) => r.instrumentId)).toEqual(["IE00BK5BQT80"]);
  });

  it("falls back gracefully when the instrument is unknown", () => {
    const rows = toPortfolioRows(
      [position({ instrumentId: "UNKNOWN" })],
      instruments,
      meta,
    );
    expect(rows[0]?.name).toBe("UNKNOWN");
    expect(rows[0]?.type).toBeNull();
    expect(rows[0]?.tradeCount).toBe(0);
  });
});

const rows: PortfolioRow[] = toPortfolioRows(
  [
    position({
      instrumentId: "IE00BK5BQT80",
      costBasis: "5000",
      quantity: "40",
    }),
    position({
      instrumentId: "NL0010273215",
      costBasis: "2000",
      quantity: "3",
    }),
    position({ instrumentId: "BTC", costBasis: "8000", quantity: "0.5" }),
  ],
  instruments,
  meta,
);

describe("sortPortfolioRows", () => {
  it("sorts by cost basis descending", () => {
    const sorted = sortPortfolioRows(rows, { key: "costBasis", dir: "desc" });
    expect(sorted.map((r) => r.instrumentId)).toEqual([
      "BTC",
      "IE00BK5BQT80",
      "NL0010273215",
    ]);
  });

  it("sorts by name ascending using locale order", () => {
    const sorted = sortPortfolioRows(rows, { key: "name", dir: "asc" });
    expect(sorted.map((r) => r.name)).toEqual([
      "ASML Holding",
      "Bitcoin",
      "Vanguard FTSE All-World",
    ]);
  });

  it("does not mutate the input", () => {
    const before = rows.map((r) => r.instrumentId);
    sortPortfolioRows(rows, { key: "quantity", dir: "asc" });
    expect(rows.map((r) => r.instrumentId)).toEqual(before);
  });
});

describe("parseSort", () => {
  it("falls back to the default when params are absent", () => {
    expect(parseSort(new URLSearchParams())).toEqual(DEFAULT_SORT);
  });

  it("rejects an invalid sort key", () => {
    expect(parseSort(new URLSearchParams("sort=hacktheplanet"))).toEqual(
      DEFAULT_SORT,
    );
  });

  it("reads a valid key and direction", () => {
    expect(parseSort(new URLSearchParams("sort=name&dir=asc"))).toEqual({
      key: "name",
      dir: "asc",
    });
  });

  it("defaults direction to the column's natural direction", () => {
    expect(parseSort(new URLSearchParams("sort=name"))).toEqual({
      key: "name",
      dir: "asc",
    });
  });
});

describe("nextSort", () => {
  it("toggles direction on the active column", () => {
    expect(nextSort("costBasis", { key: "costBasis", dir: "desc" })).toEqual({
      key: "costBasis",
      dir: "asc",
    });
  });

  it("switches column at its natural direction", () => {
    expect(nextSort("name", { key: "costBasis", dir: "desc" })).toEqual({
      key: "name",
      dir: "asc",
    });
  });
});

describe("totalInvested", () => {
  it("sums cost basis with decimal precision", () => {
    expect(totalInvested(rows)).toBe("15000.00");
  });
});
