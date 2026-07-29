import { describe, expect, it } from "vitest";

import type { Instrument, LedgerEvent } from "~/core/domain";

import { netCashFlow, toMovementRows } from "./movements";

const INSTRUMENTS: Instrument[] = [
  {
    id: "IE00BK5BQT80",
    name: "FTSE All-World",
    type: "ETF",
    currency: "EUR",
    assetClass: "Equity",
    quoteSymbol: null,
  },
];

const base = {
  currency: "EUR",
  fxToBase: "1",
  account: "TR",
  source: "trade-republic",
};

const buy = (over: Partial<LedgerEvent> = {}): LedgerEvent =>
  ({
    ...base,
    id: "e1",
    ts: new Date("2026-07-15T10:00:00Z"),
    type: "BUY",
    instrumentId: "IE00BK5BQT80",
    sleeve: "CORE",
    quantity: "10",
    price: "89.54",
    grossAmount: "895.40",
    fees: "1.00",
    ...over,
  }) as LedgerEvent;

describe("toMovementRows", () => {
  it("includes fees in a buy: the amount is what left the bank", () => {
    const [row] = toMovementRows([buy()], INSTRUMENTS);
    expect(row?.amount).toBe("-896.40");
    expect(row?.costs).toBe("1.00");
  });

  it("nets fees out of a sell: the amount is what arrived", () => {
    const [row] = toMovementRows(
      [buy({ type: "SELL", grossAmount: "895.40", fees: "1.00" })],
      INSTRUMENTS,
    );
    expect(row?.amount).toBe("894.40");
  });

  it("quotes price as a price mark, excluding fees", () => {
    const [row] = toMovementRows([buy()], INSTRUMENTS);
    expect(row?.price).toBe("89.54");
  });

  it("nets withholding out of a dividend", () => {
    const [row] = toMovementRows(
      [
        {
          ...base,
          id: "d1",
          ts: new Date("2026-06-01T00:00:00Z"),
          type: "DIVIDEND",
          instrumentId: "IE00BK5BQT80",
          sleeve: "CORE",
          grossAmount: "40.00",
          taxWithheld: "7.60",
        } as LedgerEvent,
      ],
      INSTRUMENTS,
    );
    expect(row?.amount).toBe("32.40");
    expect(row?.costs).toBe("7.60");
    expect(row?.quantity).toBeNull();
    expect(row?.price).toBeNull();
  });

  it("signs cash events by direction and leaves them instrument-less", () => {
    const cash = (type: "DEPOSIT" | "WITHDRAWAL" | "INTEREST"): LedgerEvent =>
      ({
        ...base,
        id: type,
        ts: new Date("2026-05-01T00:00:00Z"),
        type,
        grossAmount: "500.00",
      }) as LedgerEvent;

    const rows = toMovementRows(
      [cash("DEPOSIT"), cash("WITHDRAWAL"), cash("INTEREST")],
      INSTRUMENTS,
    );
    const byType = new Map(rows.map((r) => [r.type, r]));
    expect(byType.get("DEPOSIT")?.amount).toBe("500.00");
    expect(byType.get("WITHDRAWAL")?.amount).toBe("-500.00");
    expect(byType.get("INTEREST")?.amount).toBe("500.00");
    expect(byType.get("DEPOSIT")?.instrumentId).toBeNull();
    expect(byType.get("DEPOSIT")?.instrumentName).toBeNull();
  });

  it("converts to base currency, fees included", () => {
    const [row] = toMovementRows(
      [
        buy({
          currency: "USD",
          fxToBase: "0.5",
          grossAmount: "100",
          fees: "2",
        }),
      ],
      INSTRUMENTS,
    );
    expect(row?.amount).toBe("-51.00");
    expect(row?.costs).toBe("1.00");
  });

  it("holds the invariant amount = signedGross - costs for every type", () => {
    const [row] = toMovementRows([buy({ fees: "0" })], INSTRUMENTS);
    expect(row?.amount).toBe("-895.40");
  });

  it("resolves the instrument name, falling back to the id", () => {
    const rows = toMovementRows(
      [buy(), buy({ id: "e2", instrumentId: "UNKNOWN" })],
      INSTRUMENTS,
    );
    expect(rows[0]?.instrumentName).toBe("FTSE All-World");
    expect(rows[1]?.instrumentName).toBe("UNKNOWN");
  });

  it("sorts newest first", () => {
    const rows = toMovementRows(
      [
        buy({ id: "old", ts: new Date("2025-01-01T00:00:00Z") }),
        buy({ id: "new", ts: new Date("2026-07-15T00:00:00Z") }),
        buy({ id: "mid", ts: new Date("2025-09-01T00:00:00Z") }),
      ],
      INSTRUMENTS,
    );
    expect(rows.map((r) => r.id)).toEqual(["new", "mid", "old"]);
  });

  it("does not mutate the input", () => {
    const events = [
      buy({ id: "a", ts: new Date("2025-01-01T00:00:00Z") }),
      buy({ id: "b", ts: new Date("2026-01-01T00:00:00Z") }),
    ];
    toMovementRows(events, INSTRUMENTS);
    expect(events.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("guards against a zero-quantity trade rather than dividing by zero", () => {
    const [row] = toMovementRows([buy({ quantity: "0" })], INSTRUMENTS);
    expect(row?.price).toBeNull();
  });
});

describe("netCashFlow", () => {
  it("sums signed amounts", () => {
    const rows = toMovementRows(
      [
        buy({ id: "b1" }),
        buy({ id: "s1", type: "SELL", grossAmount: "1000", fees: "1" }),
      ],
      INSTRUMENTS,
    );
    expect(netCashFlow(rows)).toBe("102.60");
  });

  it("is zero for no rows", () => {
    expect(netCashFlow([])).toBe("0.00");
  });
});
