import { describe, expect, it } from "vitest";

import type { Instrument, Sleeve, TradeEvent } from "~/core/domain";

import {
  buildTaxYearView,
  listTaxYears,
  parseTaxYear,
  TAX_YEAR_PARAM,
} from "./tax";

let seq = 0;

function trade(
  type: "BUY" | "SELL",
  instrumentId: string,
  quantity: string,
  grossAmount: string,
  opts: { fees?: string; sleeve?: Sleeve; ts?: string } = {},
): TradeEvent {
  return {
    id: `evt-${seq++}`,
    ts: new Date(opts.ts ?? "2025-01-01"),
    type,
    instrumentId,
    sleeve: opts.sleeve ?? "CORE",
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

function instrument(id: string, name: string): Instrument {
  return { id, name, type: "STOCK", currency: "EUR" };
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
    expect(sale.disallowed).toBe(false);
    expect(sale.lots).toHaveLength(1);
    expect(view.allowedNet).toBe("200");
    expect(view.netSavingsBase).toBe("200");
    expect(view.scale).not.toBeNull();
    expect(Number(view.quota)).toBeGreaterThan(0);
  });

  it("flags a wash-sale loss and keeps the reason and trigger id", () => {
    const buy1 = trade("BUY", "X", "10", "1000", { ts: "2025-01-01" });
    const sell = trade("SELL", "X", "10", "700", { ts: "2025-06-01" });
    const rebuy = trade("BUY", "X", "10", "750", { ts: "2025-07-01" });

    const view = buildTaxYearView([buy1, sell, rebuy], instruments, 2025);

    const sale = view.sales[0]!;
    expect(sale.disallowed).toBe(true);
    expect(sale.disallowedReason).not.toBeNull();
    expect(sale.disallowedByBuyEventId).toBe(rebuy.id);
    expect(view.disallowedCount).toBe(1);
    expect(view.allowedCount).toBe(0);
    expect(view.ownNetBeforeExclusion).toBe("-300.00");
    expect(view.disallowedSum).toBe("-300.00");
    expect(view.allowedNet).toBe("0");
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

    expect(view.allowedNet).toBe("500");
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
