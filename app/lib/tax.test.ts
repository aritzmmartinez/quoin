import { describe, expect, it } from "vitest";

import {
  instrumentTypeSchema,
  type DividendEvent,
  type Instrument,
  type TradeEvent,
} from "~/core/domain";
import { computeTaxHistory } from "~/core/tax";
import { mapRow } from "~/adapters/ingestion/trade-republic/map";
import type { TradeRepublicRow } from "~/adapters/ingestion/trade-republic/row";

import {
  buildTaxYearView,
  groupPendingBySale,
  isBelowCent,
  inKindIncomeOf,
  listTaxYears,
  parseTaxYear,
  taxExclusions,
  TAX_YEAR_PARAM,
  repurchaseAssetClassOf,
  repurchaseAssetClasses,
  taxOptionsFor,
  unclassifiedSales,
} from "./tax";
import { jurisdictionOf } from "~/core/tax";
import { today } from "~/core/calendar";

const MADRID = "Europe/Madrid";
const BIZKAIA = jurisdictionOf("bizkaia");

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
      listTaxYears(
        [trade("BUY", "X", "10", "1000", { ts: "2025-01-01" })],
        MADRID,
      ),
    ).toEqual([]);
  });

  it("lists distinct fiscal years of sales, most recent first", () => {
    const events = [
      trade("BUY", "X", "10", "1000", { ts: "2023-01-01" }),
      trade("SELL", "X", "3", "300", { ts: "2024-06-01" }),
      trade("SELL", "X", "3", "300", { ts: "2026-06-01" }),
      trade("SELL", "X", "3", "300", { ts: "2024-09-01" }),
    ];
    expect(listTaxYears(events, MADRID)).toEqual([2026, 2024]);
  });
});

describe("parseTaxYear", () => {
  const years = [2026, 2025, 2023];

  it("uses the requested year when it has data", () => {
    const params = new URLSearchParams({ [TAX_YEAR_PARAM]: "2025" });
    expect(parseTaxYear(params, years, MADRID, new Date())).toBe(2025);
  });

  it("falls back to the current fiscal year when it has data and none was requested", () => {
    const params = new URLSearchParams();
    const now = new Date("2025-05-01");
    expect(parseTaxYear(params, years, MADRID, now)).toBe(2025);
  });

  it("falls back to the most recent year when the current one has no data", () => {
    const params = new URLSearchParams();
    const now = new Date("2024-05-01");
    expect(parseTaxYear(params, years, MADRID, now)).toBe(2026);
  });

  it("ignores a requested year with no data", () => {
    const params = new URLSearchParams({ [TAX_YEAR_PARAM]: "1999" });
    const now = new Date("2024-05-01");
    expect(parseTaxYear(params, years, MADRID, now)).toBe(2026);
  });

  it("returns null when nothing has ever been sold", () => {
    expect(
      parseTaxYear(new URLSearchParams(), [], MADRID, new Date()),
    ).toBeNull();
  });
});

describe("groupPendingBySale", () => {
  const row = (
    buyEventId: string,
    acquiredAt: string,
    origins: [string, string][],
    instrumentId = "ETH",
  ) => ({
    buyEventId,
    acquiredAt,
    instrumentId,
    name: instrumentId,
    amount: "0",
    origins: origins.map(([originT, amount], i) => ({
      originEventId: `sale-${originT}-${i}`,
      originT,
      amount,
    })),
  });

  it("makes one row per sale, adding the pieces and counting the acquisitions", () => {
    const groups = groupPendingBySale(
      [
        row("b2", "2026-08-26T05:00:00Z", [
          ["2026-08-20T11:00:00Z", "-0.0002"],
        ]),
        row("b1", "2026-08-19T05:00:00Z", [
          ["2026-08-20T11:00:00Z", "-0.0001"],
        ]),
        row("b3", "2026-09-02T05:00:00Z", [
          ["2026-08-20T11:00:00Z", "-0.0003"],
        ]),
      ],
      MADRID,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      instrumentId: "ETH",
      saleT: "2026-08-20T11:00:00Z",
      amount: "-0.0006",
    });
    expect(groups[0]?.acquisitions.map((a) => a.buyEventId)).toEqual([
      "b1",
      "b2",
      "b3",
    ]);
  });

  it("keeps apart two sales of one asset on different days and two assets on one day, oldest sale first", () => {
    const groups = groupPendingBySale(
      [
        row("b1", "2026-09-01T05:00:00Z", [
          ["2026-08-20T11:00:00Z", "-1"],
          ["2026-07-01T09:00:00Z", "-2"],
        ]),
        row(
          "b2",
          "2026-09-01T05:00:00Z",
          [["2026-08-20T11:30:00Z", "-4"]],
          "SOL",
        ),
      ],
      MADRID,
    );

    expect(groups.map((g) => [g.instrumentId, g.saleT, g.amount])).toEqual([
      ["ETH", "2026-07-01T09:00:00Z", "-2"],
      ["ETH", "2026-08-20T11:00:00Z", "-1"],
      ["SOL", "2026-08-20T11:30:00Z", "-4"],
    ]);
  });

  it("puts two sales of one asset on one Madrid day together", () => {
    const groups = groupPendingBySale(
      [
        row("b1", "2026-09-01T05:00:00Z", [
          ["2026-08-20T08:00:00Z", "-1"],
          ["2026-08-20T21:00:00Z", "-2"],
        ]),
      ],
      MADRID,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      saleT: "2026-08-20T08:00:00Z",
      amount: "-3",
    });
  });
});

describe("isBelowCent", () => {
  it("is true for a nonzero amount that rounds to 0,00 € in either direction", () => {
    for (const v of ["-0.004", "0.004", "-0.0001", "0.00499"])
      expect(isBelowCent(v)).toBe(true);
  });

  it("is false from half a cent up, and for an exact zero", () => {
    for (const v of ["-0.005", "0.005", "-0.01", "-3", "0", "-0", "0.00"])
      expect(isBelowCent(v)).toBe(false);
  });

  it("judges a group and its pieces by their own amounts", () => {
    const [group] = groupPendingBySale(
      [
        {
          buyEventId: "b1",
          acquiredAt: "2026-08-26T05:00:00Z",
          instrumentId: "ETH",
          name: "ETH",
          amount: "0",
          origins: [
            {
              originEventId: "s1",
              originT: "2026-08-20T11:00:00Z",
              amount: "-0.004",
            },
          ],
        },
        {
          buyEventId: "b2",
          acquiredAt: "2026-08-27T05:00:00Z",
          instrumentId: "ETH",
          name: "ETH",
          amount: "0",
          origins: [
            {
              originEventId: "s1",
              originT: "2026-08-20T11:00:00Z",
              amount: "-0.004",
            },
          ],
        },
      ],
      MADRID,
    );
    expect(group?.acquisitions.every((p) => isBelowCent(p.amount))).toBe(true);
    expect(isBelowCent(group?.amount ?? "0")).toBe(false);
  });
});

describe("a repurchase that defers less than a cent", () => {
  const crypto = [instrument("X", "Token", "CRYPTO")];
  const sold = (loss: string, rebuys: number) => {
    const events = [
      trade("BUY", "X", "1000", "10", { ts: "2026-01-05" }),
      trade("SELL", "X", "1000", String(10 - Number(loss)), {
        ts: "2026-03-10",
      }),
      ...Array.from({ length: rebuys }, (_, i) =>
        trade("BUY", "X", "0.001", "0.0001", {
          ts: `2026-03-${String(12 + i * 2).padStart(2, "0")}`,
        }),
      ),
    ];
    return buildTaxYearView(
      events,
      crypto,
      2026,
      BIZKAIA,
      today(MADRID, new Date()),
    );
  };

  it("is flagged as minor, still shows its repurchase, and groups its pending pieces by the sale", () => {
    const view = sold("1", 4);

    expect(view.sales[0]?.washSale).not.toBeNull();
    expect(view.sales[0]?.deferralMinor).toBe(true);
    expect(view.pending.length).toBeGreaterThan(1);
    expect(view.pendingBySale).toHaveLength(1);
    expect(view.pendingBySale[0]?.acquisitions).toHaveLength(
      view.pending.length,
    );
  });

  it("reads its non-computable loss and every recipient as below a cent, and a real deferral as neither", () => {
    const minor = sold("1", 4).sales[0];
    expect(minor?.washSale?.recipients.length).toBeGreaterThan(0);
    expect(isBelowCent(minor?.nonComputable ?? "0")).toBe(true);
    expect(
      minor?.washSale?.recipients.every((r) => isBelowCent(r.deferredLoss)),
    ).toBe(true);

    const material = buildTaxYearView(
      [
        trade("BUY", "X", "10", "1000", { ts: "2026-01-05" }),
        trade("SELL", "X", "10", "900", { ts: "2026-03-10" }),
        trade("BUY", "X", "5", "450", { ts: "2026-03-20" }),
      ],
      crypto,
      2026,
      BIZKAIA,
      today(MADRID, new Date()),
    ).sales[0];
    expect(isBelowCent(material?.nonComputable ?? "0")).toBe(false);
    expect(
      material?.washSale?.recipients.some((r) => isBelowCent(r.deferredLoss)),
    ).toBe(false);
  });

  it("is not flagged when it defers a real amount", () => {
    const view = sold("1", 1);
    const material = buildTaxYearView(
      [
        trade("BUY", "X", "10", "1000", { ts: "2026-01-05" }),
        trade("SELL", "X", "10", "900", { ts: "2026-03-10" }),
        trade("BUY", "X", "5", "450", { ts: "2026-03-20" }),
      ],
      crypto,
      2026,
      BIZKAIA,
      today(MADRID, new Date()),
    );

    expect(material.sales[0]?.washSale).not.toBeNull();
    expect(material.sales[0]?.deferralMinor).toBe(false);
    expect(view.sales[0]?.deferralMinor).toBe(true);
  });

  it("is not flagged when nothing was repurchased", () => {
    const view = buildTaxYearView(
      [
        trade("BUY", "X", "10", "1000", { ts: "2026-01-05" }),
        trade("SELL", "X", "10", "900", { ts: "2026-03-10" }),
      ],
      crypto,
      2026,
      BIZKAIA,
      today(MADRID, new Date()),
    );
    expect(view.sales[0]?.washSale).toBeNull();
    expect(view.sales[0]?.deferralMinor).toBe(false);
  });
});

describe("buildTaxYearView", () => {
  const instruments = [instrument("X", "Fondo X")];

  it("shapes a plain allowed gain with instrument name and quota", () => {
    const events = [
      trade("BUY", "X", "10", "1000", { ts: "2026-01-01" }),
      trade("SELL", "X", "10", "1200", { ts: "2026-06-01" }),
    ];

    const view = buildTaxYearView(
      events,
      instruments,
      2026,
      BIZKAIA,
      today(MADRID, new Date()),
    );

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

  it("states no scale and no quota for a year the scale table does not cover, but still the base", () => {
    const link = { linkId: "refid-1", linkKind: "swap" };
    const events = [
      trade("BUY", "ETH", "10", "1000", { ts: "2025-01-05" }),
      { ...trade("SELL", "ETH", "4", "480", { ts: "2025-03-10" }), ...link },
      {
        ...trade("BUY", "BTC", "0.0099", "465", {
          ts: "2025-03-10",
          fees: "5",
        }),
        ...link,
      },
    ];
    const view = buildTaxYearView(
      events,
      [
        instrument("ETH", "Ether", "CRYPTO"),
        instrument("BTC", "Bitcoin", "CRYPTO"),
      ],
      2025,
      BIZKAIA,
      today(MADRID, new Date()),
    );

    expect(view.sales).toHaveLength(1);
    expect(view.netSavingsBase).toBe("75");
    expect(view.scale).toBeNull();
    expect(view.quota).toBeNull();
  });

  it("shows a deferred loss with its breakdown and the units that carry it", () => {
    const buy1 = trade("BUY", "X", "10", "1000", { ts: "2025-01-01" });
    const sell = trade("SELL", "X", "10", "700", { ts: "2025-06-01" });
    const rebuy = trade("BUY", "X", "4", "300", { ts: "2025-07-01" });

    const view = buildTaxYearView(
      [buy1, sell, rebuy],
      instruments,
      2025,
      BIZKAIA,
      today(MADRID, new Date()),
    );

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
        instrumentId: "X",
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

    const view = buildTaxYearView(
      events,
      instruments,
      2026,
      BIZKAIA,
      today(MADRID, new Date()),
    );

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

  it("keeps crypto sold before 2025 outside the rule, from Instrument.type, with a notice", () => {
    const btc = [...instruments, instrument("BTC", "Bitcoin", "CRYPTO")];
    const sell = trade("SELL", "BTC", "1", "50000", { ts: "2024-05-08" });
    const rebuy = trade("BUY", "BTC", "1", "52000", { ts: "2024-05-20" });
    const events = [
      trade("BUY", "BTC", "1", "60000", { ts: "2024-01-10" }),
      sell,
      rebuy,
    ];

    const view = buildTaxYearView(
      events,
      btc,
      2024,
      BIZKAIA,
      today(MADRID, new Date()),
    );

    expect(view.sales[0]!.washSale).toBeNull();
    expect(view.sales[0]!.unlistedRepurchaseAt).toBe(rebuy.ts.toISOString());
    expect(view.computableNet).toBe("-10000");
  });

  it("defers a crypto loss from 2025 on under Art. 43.i, from Instrument.type", () => {
    const btc = [...instruments, instrument("BTC", "Bitcoin", "CRYPTO")];
    const sell = trade("SELL", "BTC", "1", "50000", { ts: "2026-05-08" });
    const rebuy = trade("BUY", "BTC", "1", "52000", { ts: "2026-05-20" });
    const events = [
      trade("BUY", "BTC", "1", "60000", { ts: "2026-01-10" }),
      sell,
      rebuy,
    ];

    const view = buildTaxYearView(
      events,
      btc,
      2026,
      BIZKAIA,
      today(MADRID, new Date()),
    );

    expect(view.sales[0]!.washSale).toMatchObject({
      letter: "i",
      windowMonths: 2,
      repurchased: "1",
    });
    expect(view.sales[0]!.unlistedRepurchaseAt).toBeNull();
    expect(view.computableNet).toBe("0");
  });

  it("orders sales chronologically (FIFO order), not by insertion order", () => {
    const events = [
      trade("BUY", "X", "20", "2000", { ts: "2024-01-01" }),
      trade("SELL", "X", "5", "600", { ts: "2025-09-01" }),
      trade("SELL", "X", "5", "550", { ts: "2025-03-01" }),
    ];

    const view = buildTaxYearView(
      events,
      instruments,
      2025,
      BIZKAIA,
      today(MADRID, new Date()),
    );

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

    const view = buildTaxYearView(
      events,
      instruments,
      2025,
      BIZKAIA,
      today(MADRID, new Date()),
    );

    expect(view.computableNet).toBe("500");
    expect(view.netSavingsBase).toBe("200");
    expect(view.carryforward.at(-1)?.consumedFromCarryforward).toBe("300");
  });

  it("refuses a sale of an instrument it has no record of, instead of guessing its class", () => {
    const events = [
      trade("BUY", "Y", "10", "1000", { ts: "2025-01-01" }),
      trade("SELL", "Y", "10", "1200", { ts: "2025-06-01" }),
    ];

    expect(() =>
      buildTaxYearView(
        events,
        instruments,
        2025,
        BIZKAIA,
        today(MADRID, new Date()),
      ),
    ).toThrow("No repurchase asset class for instrument Y");
  });
});

describe("repurchaseAssetClasses", () => {
  it("takes exactly the instruments typed CRYPTO as fungible crypto", () => {
    expect([
      ...repurchaseAssetClasses([
        instrument("BTC", "Bitcoin", "CRYPTO"),
        instrument("GOLD", "Physical gold ETC", "ETF"),
        instrument("X", "Fondo X"),
      ]),
    ]).toEqual([
      ["BTC", "fungible-crypto"],
      ["GOLD", "listed-security"],
      ["X", "listed-security"],
    ]);
  });

  it("gives every instrument type a class", () => {
    expect(
      Object.fromEntries(
        instrumentTypeSchema.options.map((type) => [
          type,
          repurchaseAssetClassOf(type),
        ]),
      ),
    ).toEqual({
      ETF: "listed-security",
      STOCK: "listed-security",
      CRYPTO: "fungible-crypto",
      BOND: "unclassified",
      COMMODITY: "unclassified",
      CASH: "unclassified",
    });
  });
});

describe("unclassifiedSales", () => {
  const instruments = [
    instrument("B", "Bono directo", "BOND"),
    instrument("G", "Oro físico", "COMMODITY"),
    instrument("X", "Fondo X", "ETF"),
  ];

  it("names each unclassified instrument that has ever been sold, once", () => {
    const events = [
      trade("BUY", "B", "10", "1000", { ts: "2024-01-01" }),
      trade("SELL", "B", "5", "480", { ts: "2024-06-01" }),
      trade("SELL", "B", "5", "490", { ts: "2026-06-01" }),
      trade("BUY", "G", "1", "2000", { ts: "2025-01-01" }),
      trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
      trade("SELL", "X", "10", "900", { ts: "2025-06-01" }),
    ];

    expect(unclassifiedSales(events, instruments)).toEqual(["Bono directo"]);
  });

  it("assesses no repurchase on such a sale, and gives it no notice", () => {
    const sell = trade("SELL", "B", "10", "900", { ts: "2026-05-08" });
    const events = [
      trade("BUY", "B", "10", "1000", { ts: "2026-01-10" }),
      sell,
      trade("BUY", "B", "10", "905", { ts: "2026-05-20" }),
    ];

    const view = buildTaxYearView(
      events,
      instruments,
      2026,
      BIZKAIA,
      today(MADRID, new Date()),
    );

    expect(view.sales[0]!.washSale).toBeNull();
    expect(view.sales[0]!.unlistedRepurchaseAt).toBeNull();
    expect(view.computableNet).toBe("-100");
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
      computeTaxHistory(
        [...ledger, ...incomes],
        taxOptionsFor(instruments, BIZKAIA),
      ),
    ).toEqual(computeTaxHistory(ledger, taxOptionsFor(instruments, BIZKAIA)));

    const { inKindIncome: _with, ...withIncome } = buildTaxYearView(
      [...ledger, ...incomes],
      instruments,
      2025,
      BIZKAIA,
      today(MADRID, new Date()),
    );
    const { inKindIncome: _without, ...withoutIncome } = buildTaxYearView(
      ledger,
      instruments,
      2025,
      BIZKAIA,
      today(MADRID, new Date()),
    );
    expect(withIncome).toEqual(withoutIncome);
  });

  it("is listed for its Madrid fiscal year, with what was withheld", () => {
    expect(inKindIncomeOf(incomes, 2025, MADRID)).toEqual({
      count: 1,
      gross: "1.00",
      withheld: "0.19",
    });
    expect(inKindIncomeOf(incomes, 2026, MADRID)).toEqual({
      count: 1,
      gross: "2.00",
      withheld: "0.38",
    });
  });

  it("opens a tax year even when nothing was sold in it", () => {
    expect(listTaxYears([...ledger, ...incomes], MADRID)).toEqual([2026, 2025]);
  });

  it("leaves a cash dividend out of the block", () => {
    const cash = {
      ...reward("2025-05-01T10:00:00Z", "5"),
      funding: "CASH" as const,
    };
    expect(inKindIncomeOf([cash], 2025, MADRID).count).toBe(0);
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

    const view = buildTaxYearView(
      events,
      crypto,
      2026,
      BIZKAIA,
      today(MADRID, new Date()),
    );

    expect(repurchaseAssetClasses(crypto).get("BTC")).toBe("fungible-crypto");
    expect(view.sales).toHaveLength(1);
    expect(view.sales[0]!.name).toBe("Bitcoin");
    expect(view.computableNet).toBe("-100");
  });
});

describe("a repurchase window still open", () => {
  const instruments = [
    instrument("X", "Fondo X", "ETF"),
    instrument("BTC", "Bitcoin", "CRYPTO"),
  ];

  function lossSale(id: string, saleTs: string) {
    const sell = trade("SELL", id, "1", "50", { ts: saleTs });
    return {
      sell,
      events: [trade("BUY", id, "1", "60", { ts: "2024-01-10" }), sell],
    };
  }

  it("is named until the last day of the window after a loss, under letter g", () => {
    const { events } = lossSale("X", "2026-05-08T10:00:00Z");

    const open = (today: string) =>
      buildTaxYearView(events, instruments, 2026, BIZKAIA, today).sales[0]!
        .windowOpenUntil;

    expect(open("2026-05-08")).toBe("2026-07-08");
    expect(open("2026-07-08")).toBe("2026-07-08");
    expect(open("2026-07-09")).toBeNull();
  });

  it("is named under letter i too, across the new year", () => {
    const { events } = lossSale("BTC", "2025-11-20T10:00:00Z");

    const view = buildTaxYearView(
      events,
      instruments,
      2025,
      BIZKAIA,
      "2026-01-05",
    );

    expect(view.sales[0]!.windowOpenUntil).toBe("2026-01-20");
  });

  it("is named whether or not a repurchase has already been found", () => {
    const { events } = lossSale("X", "2026-05-08T10:00:00Z");
    const rebought = [
      ...events,
      trade("BUY", "X", "1", "52", { ts: "2026-05-20T10:00:00Z" }),
    ];

    const sale = buildTaxYearView(
      rebought,
      instruments,
      2026,
      BIZKAIA,
      "2026-06-01",
    ).sales[0]!;

    expect(sale.washSale).not.toBeNull();
    expect(sale.windowOpenUntil).toBe("2026-07-08");
  });

  it("is not named for a sale at a gain", () => {
    const events = [
      trade("BUY", "X", "1", "40", { ts: "2024-01-10" }),
      trade("SELL", "X", "1", "50", { ts: "2026-05-08T10:00:00Z" }),
    ];

    const view = buildTaxYearView(
      events,
      instruments,
      2026,
      BIZKAIA,
      "2026-05-09",
    );

    expect(view.sales[0]!.windowOpenUntil).toBeNull();
  });

  it("is not named for a sale no rule covers", () => {
    const { events } = lossSale("BTC", "2024-12-20T10:00:00Z");

    const view = buildTaxYearView(
      events,
      instruments,
      2024,
      BIZKAIA,
      "2025-01-05",
    );

    expect(view.sales[0]!.windowOpenUntil).toBeNull();
  });
});
