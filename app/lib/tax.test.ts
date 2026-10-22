import { describe, expect, it } from "vitest";

import type { DividendEvent, Instrument, TradeEvent } from "~/core/domain";
import { computeTaxHistory } from "~/core/tax";
import { mapRow } from "~/adapters/ingestion/trade-republic/map";
import type { TradeRepublicRow } from "~/adapters/ingestion/trade-republic/row";

import {
  buildTaxYearView,
  inKindIncomeOf,
  listTaxYears,
  parseTaxYear,
  taxExclusions,
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
    account: "test",
    source: "TEST",
  };
}

function instrument(
  id: string,
  name: string,
  type: Instrument["type"] = "STOCK",
): Instrument {
  return { id, name, type, thesis: "CORE" };
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

describe("income received in kind", () => {
  function reward(ts: string, grossAmount: string, taxWithheld = "0") {
    const income: DividendEvent = {
      id: `evt-${seq++}`,
      ts: new Date(ts),
      type: "DIVIDEND",
      instrumentId: "X",
      grossAmount,
      taxWithheld,
      funding: "IN_KIND",
      currency: "EUR",
      account: "test",
      source: "TEST",
    };
    return income;
  }

  const ledger = [
    trade("BUY", "X", "10", "1000", { ts: "2025-01-10" }),
    trade("SELL", "X", "5", "400", { ts: "2025-03-10" }),
    trade("BUY", "X", "2", "160", { ts: "2025-04-01" }),
    trade("SELL", "X", "4", "480", { ts: "2025-09-01" }),
  ];
  const incomes = [
    reward("2025-02-01T10:00:00Z", "1.00", "0.19"),
    reward("2025-12-31T23:30:00Z", "2.00", "0.38"),
  ];
  const instruments = [instrument("X", "Test ETF", "ETF")];

  it("is read by no tax calculation", () => {
    expect(
      computeTaxHistory([...ledger, ...incomes], {
        unlistedInstrumentIds: new Set(),
      }),
    ).toEqual(computeTaxHistory(ledger, { unlistedInstrumentIds: new Set() }));

    const { inKindIncome: _with, ...withIncome } = buildTaxYearView(
      [...ledger, ...incomes],
      instruments,
      2025,
    );
    const { inKindIncome: _without, ...withoutIncome } = buildTaxYearView(
      ledger,
      instruments,
      2025,
    );
    expect(withIncome).toEqual(withoutIncome);
  });

  it("is listed for its Madrid fiscal year, with what was withheld", () => {
    expect(inKindIncomeOf(incomes, 2025)).toEqual({
      count: 1,
      gross: "1.00",
      withheld: "0.19",
    });
    expect(inKindIncomeOf(incomes, 2026)).toEqual({
      count: 1,
      gross: "2.00",
      withheld: "0.38",
    });
  });

  it("opens a tax year even when nothing was sold in it", () => {
    expect(listTaxYears([...ledger, ...incomes])).toEqual([2026, 2025]);
  });

  it("leaves a cash dividend out of the block", () => {
    const cash = {
      ...reward("2025-05-01T10:00:00Z", "5"),
      funding: "CASH" as const,
    };
    expect(inKindIncomeOf([cash], 2025).count).toBe(0);
  });
});

describe("taxExclusions", () => {
  it("names every instrument the FIFO left out for want of a rate", () => {
    const events = [
      trade("BUY", "IE00TEST0001", "1", "100"),
      { ...trade("BUY", "US00TEST0002", "1", "100"), currency: "USD" },
    ];
    expect(
      taxExclusions(events, [
        instrument("IE00TEST0001", "Synthetic Fund"),
        instrument("US00TEST0002", "Synthetic Stock"),
      ]),
    ).toEqual(["Synthetic Stock"]);
  });

  it("names nothing when every trade has a rate", () => {
    const events = [trade("BUY", "IE00TEST0001", "1", "100")];
    expect(taxExclusions(events, [])).toEqual([]);
  });
});

describe("crypto from Trade Republic in the tax view", () => {
  const trRow = (over: Partial<TradeRepublicRow>): TradeRepublicRow => ({
    datetime: "2026-01-10T10:00:00.000Z",
    category: "TRADING",
    type: "BUY",
    asset_class: "CRYPTO",
    name: "Bitcoin",
    symbol: "BTC",
    shares: "0.01",
    price: "60000",
    amount: "-600",
    fee: "",
    tax: "",
    currency: "EUR",
    transaction_id: "tr-buy",
    ...over,
  });

  it("reaches the tax view as a CRYPTO sale", () => {
    const mapped = [
      mapRow(trRow({})),
      mapRow(
        trRow({
          datetime: "2026-05-08T16:39:00.000Z",
          type: "SELL",
          price: "50000",
          amount: "500",
          transaction_id: "tr-sell",
        }),
      ),
    ].flatMap((item) => (item.kind === "domain" ? [item] : []));
    const events = mapped.map((item) => item.event);
    const crypto = mapped.flatMap((item) =>
      item.instrument ? [item.instrument] : [],
    );

    const view = buildTaxYearView(events, crypto, 2026);

    expect([...unlistedInstrumentIds(crypto)]).toEqual(["BTC"]);
    expect(view.sales).toHaveLength(1);
    expect(view.sales[0]!.name).toBe("Bitcoin");
    expect(view.computableNet).toBe("-100");
  });
});
