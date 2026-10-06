import { describe, expect, it } from "vitest";

import type { Instrument, TradeEvent } from "~/core/domain";

import {
  buildTaxYearView,
  listTaxYears,
  parseTaxYear,
  TAX_YEAR_PARAM,
  unlistedInstrumentIds,
} from "./tax";

let seq = 0;

function trade(
  type: "BUY" | "SELL",
  instrumentId: string,
  quantity: string,
  grossAmount: string,
  opts: { fees?: string; ts?: string } = {},
): TradeEvent {
  return {
    id: `evt-${seq++}`,
    ts: new Date(opts.ts ?? "2025-01-01"),
    type,
    instrumentId,
    quantity,
    price: "0",
    grossAmount,
    fees: opts.fees ?? "0",
    currency: "EUR",
    fxToBase: "1",
    account: "test",
    source: "TEST",
  };
}

function instrument(
  id: string,
  name: string,
  type: Instrument["type"] = "STOCK",
): Instrument {
  return { id, name, type, currency: "EUR", thesis: "CORE" };
}

describe("listTaxYears", () => {
  it("is empty with no sales", () => {
    expect(
      listTaxYears([trade("BUY", "X", "10", "1000", { ts: "2025-01-01" })]),
    ).toEqual([]);
  });

  it("lists distinct fiscal years of sales, most recent first", () => {
    const events = [
      trade("BUY", "X", "10", "1000", { ts: "2023-01-01" }),
      trade("SELL", "X", "3", "300", { ts: "2024-06-01" }),
      trade("SELL", "X", "3", "300", { ts: "2026-06-01" }),
      trade("SELL", "X", "3", "300", { ts: "2024-09-01" }),
    ];
    expect(listTaxYears(events)).toEqual([2026, 2024]);
  });
});

describe("parseTaxYear", () => {
  const years = [2026, 2025, 2023];

  it("uses the requested year when it has data", () => {
    const params = new URLSearchParams({ [TAX_YEAR_PARAM]: "2025" });
    expect(parseTaxYear(params, years)).toBe(2025);
  });

  it("falls back to the current fiscal year when it has data and none was requested", () => {
    const params = new URLSearchParams();
    const now = new Date("2025-05-01");
    expect(parseTaxYear(params, years, now)).toBe(2025);
  });

  it("falls back to the most recent year when the current one has no data", () => {
    const params = new URLSearchParams();
    const now = new Date("2024-05-01");
    expect(parseTaxYear(params, years, now)).toBe(2026);
  });

  it("ignores a requested year with no data", () => {
    const params = new URLSearchParams({ [TAX_YEAR_PARAM]: "1999" });
    const now = new Date("2024-05-01");
    expect(parseTaxYear(params, years, now)).toBe(2026);
  });

  it("returns null when nothing has ever been sold", () => {
    expect(parseTaxYear(new URLSearchParams(), [])).toBeNull();
  });
});

describe("buildTaxYearView", () => {
  const instruments = [instrument("X", "Fondo X")];

  it("shapes a plain allowed gain with instrument name and quota", () => {
    const events = [
      trade("BUY", "X", "10", "1000", { ts: "2026-01-01" }),
      trade("SELL", "X", "10", "1200", { ts: "2026-06-01" }),
    ];

    const view = buildTaxYearView(events, instruments, 2026);

    expect(view.sales).toHaveLength(1);
    const sale = view.sales[0]!;
    expect(sale.name).toBe("Fondo X");
    expect(sale.washSale).toBeNull();
    expect(sale.lots).toHaveLength(1);
    expect(view.computableNet).toBe("200");
    expect(view.netSavingsBase).toBe("200");
    expect(view.scale).not.toBeNull();
    expect(Number(view.quota)).toBeGreaterThan(0);
  });

  it("shows a deferred loss with its breakdown and the units that carry it", () => {
    const buy1 = trade("BUY", "X", "10", "1000", { ts: "2025-01-01" });
    const sell = trade("SELL", "X", "10", "700", { ts: "2025-06-01" });
    const rebuy = trade("BUY", "X", "4", "300", { ts: "2025-07-01" });

    const view = buildTaxYearView([buy1, sell, rebuy], instruments, 2025);

    const sale = view.sales[0]!;
    expect(sale.nonComputable).toBe("-120");
    expect(sale.computablePnL).toBe("-180");
    expect(sale.washSale).toMatchObject({
      repurchaseAfter: "4",
      repurchased: "4",
      fraction: "0.4",
      recipients: [
        { buyEventId: rebuy.id, quantity: "4", deferredLoss: "-120" },
      ],
    });
    expect(view.affectedCount).toBe(1);
    expect(view.ownNet).toBe("-300.00");
    expect(view.nonComputableSum).toBe("-120.00");
    expect(view.computableNet).toBe("-180");
    expect(view.pending).toEqual([
      {
        buyEventId: rebuy.id,
        acquiredAt: rebuy.ts.toISOString(),
        name: "Fondo X",
        amount: "-120",
        origins: [
          {
            originEventId: sell.id,
            originT: sell.ts.toISOString(),
            amount: "-120",
          },
        ],
      },
    ]);
    expect(view.pendingSum).toBe("-120.00");
  });

  it("lists the deferred losses that compute in the year with their origin", () => {
    const sell = trade("SELL", "X", "10", "700", { ts: "2025-06-01" });
    const final = trade("SELL", "X", "10", "800", { ts: "2026-06-01" });
    const events = [
      trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
      sell,
      trade("BUY", "X", "10", "750", { ts: "2025-07-01" }),
      final,
    ];

    const view = buildTaxYearView(events, instruments, 2026);

    expect(view.integrations).toEqual([
      {
        originEventId: sell.id,
        originT: sell.ts.toISOString(),
        integratedByEventId: final.id,
        t: final.ts.toISOString(),
        name: "Fondo X",
        amount: "-300",
      },
    ]);
    expect(view.integratedSum).toBe("-300.00");
    expect(view.computableNet).toBe("-250");
    expect(view.pending).toEqual([]);
  });

  it("keeps crypto outside the rule, from Instrument.type, with a notice", () => {
    const btc = [...instruments, instrument("BTC", "Bitcoin", "CRYPTO")];
    const sell = trade("SELL", "BTC", "1", "50000", { ts: "2026-05-08" });
    const rebuy = trade("BUY", "BTC", "1", "52000", { ts: "2026-05-20" });
    const events = [
      trade("BUY", "BTC", "1", "60000", { ts: "2026-01-10" }),
      sell,
      rebuy,
    ];

    const view = buildTaxYearView(events, btc, 2026);

    expect(view.sales[0]!.washSale).toBeNull();
    expect(view.sales[0]!.unlistedRepurchaseAt).toBe(rebuy.ts.toISOString());
    expect(view.computableNet).toBe("-10000");
  });

  it("orders sales chronologically (FIFO order), not by insertion order", () => {
    const events = [
      trade("BUY", "X", "20", "2000", { ts: "2024-01-01" }),
      trade("SELL", "X", "5", "600", { ts: "2025-09-01" }),
      trade("SELL", "X", "5", "550", { ts: "2025-03-01" }),
    ];

    const view = buildTaxYearView(events, instruments, 2025);

    expect(view.sales.map((s) => s.t)).toEqual([
      new Date("2025-03-01").toISOString(),
      new Date("2025-09-01").toISOString(),
    ]);
  });

  it("carries a loss forward into the target year's net savings base", () => {
    const events = [
      trade("BUY", "X", "10", "1000", { ts: "2024-01-01" }),
      trade("SELL", "X", "10", "700", { ts: "2024-06-01" }), // -300, no repurchase
      trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
      trade("SELL", "X", "10", "1500", { ts: "2025-06-01" }), // +500
    ];

    const view = buildTaxYearView(events, instruments, 2025);

    expect(view.computableNet).toBe("500");
    expect(view.netSavingsBase).toBe("200");
    expect(view.carryforward.at(-1)?.consumedFromCarryforward).toBe("300");
  });

  it("reports no instrument name it doesn't have as a fallback to the id", () => {
    const events = [
      trade("BUY", "Y", "10", "1000", { ts: "2025-01-01" }),
      trade("SELL", "Y", "10", "1200", { ts: "2025-06-01" }),
    ];

    const view = buildTaxYearView(events, instruments, 2025);
    expect(view.sales[0]!.name).toBe("Y");
  });
});

describe("unlistedInstrumentIds", () => {
  it("takes exactly the instruments typed CRYPTO", () => {
    expect([
      ...unlistedInstrumentIds([
        instrument("BTC", "Bitcoin", "CRYPTO"),
        instrument("GOLD", "Physical gold ETC", "ETF"),
        instrument("X", "Fondo X"),
      ]),
    ]).toEqual(["BTC"]);
  });
});
