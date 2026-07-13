import { describe, expect, it } from "vitest";

import type { Instrument } from "~/core/domain";
import type { MarketValue, Position, TradeMeta } from "~/core/projections";
import { tradeMetaKey } from "~/core/projections";

import {
  DEFAULT_SORT,
  nextSort,
  parseSort,
  sortPortfolioRows,
  toPortfolioRows,
  totalInvested,
  totalMarketValue,
  totalUnrealizedPnL,
  type PortfolioRow,
} from "./portfolio";

const instruments: Instrument[] = [
  { id: "IE00BK5BQT80", name: "Vanguard FTSE All-World", type: "ETF", currency: "EUR" },
  { id: "NL0010273215", name: "ASML Holding", type: "STOCK", currency: "EUR" },
  { id: "BTC", name: "Bitcoin", type: "CRYPTO", currency: "EUR" },
];

function position(overrides: Partial<Position> & Pick<Position, "instrumentId">): Position {
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
    { firstTradeAt: new Date("2026-01-01"), lastTradeAt: new Date("2026-06-01"), tradeCount: 3 },
  ],
]);

const noMarket = new Map<string, MarketValue>();

describe("toPortfolioRows", () => {
  it("joins position, instrument, trade meta and market values", () => {
    const market = new Map<string, MarketValue>([
      [
        tradeMetaKey("IE00BK5BQT80", "CORE"),
        { marketValue: "1200", unrealizedPnL: "200", weight: "1.000000" },
      ],
    ]);
    const rows = toPortfolioRows(
      [position({ instrumentId: "IE00BK5BQT80" })],
      instruments,
      meta,
      market,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Vanguard FTSE All-World",
      type: "ETF",
      currency: "EUR",
      tradeCount: 3,
      marketValue: "1200",
      unrealizedPnL: "200",
      weight: "1.000000",
      firstTradeAt: new Date("2026-01-01").toISOString(),
    });
  });

  it("leaves market fields null when the position is unpriced", () => {
    const rows = toPortfolioRows(
      [position({ instrumentId: "IE00BK5BQT80" })],
      instruments,
      meta,
      noMarket,
    );
    expect(rows[0]?.marketValue).toBeNull();
    expect(rows[0]?.weight).toBeNull();
  });

  it("excludes closed positions (quantity 0)", () => {
    const rows = toPortfolioRows(
      [
        position({ instrumentId: "IE00BK5BQT80" }),
        position({ instrumentId: "NL0010273215", quantity: "0", costBasis: "0" }),
      ],
      instruments,
      meta,
      noMarket,
    );
    expect(rows.map((r) => r.instrumentId)).toEqual(["IE00BK5BQT80"]);
  });

  it("falls back gracefully when the instrument is unknown", () => {
    const rows = toPortfolioRows(
      [position({ instrumentId: "UNKNOWN" })],
      instruments,
      meta,
      noMarket,
    );
    expect(rows[0]?.name).toBe("UNKNOWN");
    expect(rows[0]?.type).toBeNull();
    expect(rows[0]?.tradeCount).toBe(0);
  });
});

const market = new Map<string, MarketValue>([
  [tradeMetaKey("IE00BK5BQT80", "CORE"), { marketValue: "6000", unrealizedPnL: "1000", weight: "0.400000" }],
  [tradeMetaKey("BTC", "CORE"), { marketValue: "9000", unrealizedPnL: "1000", weight: "0.600000" }],
  // NL0010273215 intentionally unpriced
]);

const rows: PortfolioRow[] = toPortfolioRows(
  [
    position({ instrumentId: "IE00BK5BQT80", costBasis: "5000", quantity: "40" }),
    position({ instrumentId: "NL0010273215", costBasis: "2000", quantity: "3" }),
    position({ instrumentId: "BTC", costBasis: "8000", quantity: "0.5" }),
  ],
  instruments,
  meta,
  market,
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

  it("pushes unpriced rows to the bottom regardless of direction", () => {
    const desc = sortPortfolioRows(rows, { key: "weight", dir: "desc" });
    expect(desc.map((r) => r.instrumentId)).toEqual(["BTC", "IE00BK5BQT80", "NL0010273215"]);
    const asc = sortPortfolioRows(rows, { key: "weight", dir: "asc" });
    // the unpriced ASML stays last even ascending
    expect(asc.at(-1)?.instrumentId).toBe("NL0010273215");
    expect(asc[0]?.instrumentId).toBe("IE00BK5BQT80");
  });

  it("does not mutate the input", () => {
    const before = rows.map((r) => r.instrumentId);
    sortPortfolioRows(rows, { key: "quantity", dir: "asc" });
    expect(rows.map((r) => r.instrumentId)).toEqual(before);
  });
});

describe("parseSort", () => {
  it("defaults to weight descending (heaviest holdings first)", () => {
    expect(DEFAULT_SORT).toEqual({ key: "weight", dir: "desc" });
    expect(parseSort(new URLSearchParams())).toEqual(DEFAULT_SORT);
  });

  it("rejects an invalid sort key", () => {
    expect(parseSort(new URLSearchParams("sort=hacktheplanet"))).toEqual(DEFAULT_SORT);
  });

  it("reads a valid key and direction", () => {
    expect(parseSort(new URLSearchParams("sort=name&dir=asc"))).toEqual({
      key: "name",
      dir: "asc",
    });
  });

  it("defaults direction to the column's natural direction", () => {
    expect(parseSort(new URLSearchParams("sort=name"))).toEqual({ key: "name", dir: "asc" });
  });
});

describe("nextSort", () => {
  it("toggles direction on the active column", () => {
    expect(nextSort("marketValue", { key: "marketValue", dir: "desc" })).toEqual({
      key: "marketValue",
      dir: "asc",
    });
  });

  it("switches column at its natural direction", () => {
    expect(nextSort("name", { key: "weight", dir: "desc" })).toEqual({
      key: "name",
      dir: "asc",
    });
  });
});

describe("totals", () => {
  it("sums cost basis with decimal precision", () => {
    expect(totalInvested(rows)).toBe("15000.00");
  });

  it("sums market value over priced rows only", () => {
    expect(totalMarketValue(rows)).toBe("15000.00"); // 6000 + 9000
  });

  it("sums unrealized P&L over priced rows only", () => {
    expect(totalUnrealizedPnL(rows)).toBe("2000.00"); // 1000 + 1000
  });

  it("returns null totals when nothing is priced", () => {
    const unpriced = toPortfolioRows(
      [position({ instrumentId: "IE00BK5BQT80" })],
      instruments,
      meta,
      noMarket,
    );
    expect(totalMarketValue(unpriced)).toBeNull();
    expect(totalUnrealizedPnL(unpriced)).toBeNull();
  });
});
