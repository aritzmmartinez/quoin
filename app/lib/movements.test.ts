import { describe, expect, it } from "vitest";

import type { Instrument, LedgerEvent } from "~/core/domain";

import { netCashFlow, toMovementRows } from "./movements";

const INSTRUMENTS: Instrument[] = [
  {
    id: "IE00BK5BQT80",
    name: "FTSE All-World",
    type: "ETF",
    assetClass: "Equity",
    quoteSymbol: null,
    thesis: "CORE",
  },
];

const base = {
  currency: "EUR",
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

  it("marks both legs of an in-kind acquisition, which together move no cash", () => {
    const purchase = buy({
      fees: "0",
      grossAmount: "0.81",
      funding: "IN_KIND",
    });
    const income = {
      ...base,
      id: "e2",
      ts: new Date("2026-07-14T10:00:00Z"),
      type: "DIVIDEND",
      instrumentId: "IE00BK5BQT80",
      grossAmount: "1.00",
      taxWithheld: "0.19",
      funding: "IN_KIND",
    } as LedgerEvent;
    const rows = toMovementRows([purchase, income], INSTRUMENTS);

    expect(rows.map((r) => r.inKind)).toEqual([true, true]);
    expect(netCashFlow(rows)).toBe("0.00");
    expect(toMovementRows([buy()], INSTRUMENTS)[0]?.inKind).toBe(false);
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
          fxSource: "ECB",
          fxRate: "0.5",
          fxDirection: "BASE_PER_QUOTE",
          fxDate: "2025-01-01",
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

describe("a row with no rate to euros", () => {
  it("shows no amount, no costs and no price, and says why", () => {
    const [row] = toMovementRows(
      [buy({ currency: "USD", fees: "2" })],
      INSTRUMENTS,
    );
    expect(row).toMatchObject({
      amount: null,
      costs: null,
      price: null,
      quantity: "10",
      currency: "USD",
      noRate: true,
    });
  });

  it("is left out of the net cash flow instead of counted at 1:1", () => {
    const rows = toMovementRows(
      [buy({ id: "b1" }), buy({ id: "b2", currency: "USD" })],
      INSTRUMENTS,
    );
    expect(netCashFlow(rows)).toBe("-896.40");
  });
});

describe("a swap in the rows", () => {
  const link = { linkId: "refid-1", linkKind: "swap" };
  const legs = [
    buy({
      id: "s1",
      type: "SELL",
      instrumentId: "SOL",
      quantity: "2",
      grossAmount: "480",
      fees: "0",
      ...link,
    }),
    buy({
      id: "s2",
      instrumentId: "BTC",
      quantity: "0.005",
      grossAmount: "465",
      fees: "5",
      ...link,
    }),
    buy({ id: "other", instrumentId: "ETH" }),
  ];
  const instruments = [
    ...INSTRUMENTS,
    ...["SOL", "BTC", "ETH"].map((id) => ({
      id,
      name: id,
      type: "CRYPTO" as const,
      thesis: "CORE" as const,
    })),
  ];

  it("names where the swap went on both legs, from the sold asset to the bought one", () => {
    const rows = toMovementRows(legs, instruments);
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get("s1")?.swapRoute).toBe("SOL → BTC");
    expect(byId.get("s2")?.swapRoute).toBe("SOL → BTC");
    expect(byId.get("other")?.swapRoute).toBeNull();
  });

  it("shows the value of the leg without a sign, whichever side it is", () => {
    const rows = toMovementRows(legs, instruments);
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get("s1")?.amount).toBe("480.00");
    expect(byId.get("s2")?.amount).toBe("465.00");
  });

  it("finds the other leg when only one instrument is asked for", () => {
    const rows = toMovementRows(legs, instruments, { instrumentId: "BTC" });
    expect(rows.map((row) => row.id)).toEqual(["s2"]);
    expect(rows[0]?.swapRoute).toBe("SOL → BTC");
  });

  it("has no route for a leg whose partner is not in the ledger", () => {
    const [row] = toMovementRows([legs[1]!], instruments);
    expect(row?.swap).toBe(true);
    expect(row?.swapRoute).toBeNull();
  });
});

describe("a swap in the net cash flow", () => {
  it("shows both legs and leaves them out of the net, since no money crossed the bank", () => {
    const link = { linkId: "refid-1", linkKind: "swap" };
    const rows = toMovementRows(
      [
        buy({ id: "b1", fees: "0", grossAmount: "1000" }),
        buy({ id: "s1", type: "SELL", grossAmount: "480", fees: "5", ...link }),
        buy({ id: "s2", grossAmount: "465", fees: "5", ...link }),
      ],
      INSTRUMENTS,
    );
    expect(rows.filter((row) => row.swap)).toHaveLength(2);
    expect(netCashFlow(rows)).toBe("-1000.00");
  });
});
