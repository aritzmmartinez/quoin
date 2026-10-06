import { describe, expect, it } from "vitest";

import type { TradeEvent } from "../domain";

import { fiscalYearOf } from "./fiscal-year";
import { computeTaxHistory, computeTaxLots, taxYearOf } from "./tax-lots";

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

const LISTED = { unlistedInstrumentIds: new Set<string>() };

function year(events: TradeEvent[], y: number, unlisted: string[] = []) {
  return computeTaxLots(events, y, {
    unlistedInstrumentIds: new Set(unlisted),
  });
}

describe("fiscalYearOf", () => {
  it("uses the calendar year in Madrid time, not UTC's", () => {
    expect(fiscalYearOf(new Date("2025-12-31T23:30:00Z"))).toBe(2026);
    expect(fiscalYearOf(new Date("2025-12-31T20:00:00Z"))).toBe(2025);
  });
});

describe("computeTaxLots", () => {
  it("reports an empty year when nothing was sold in it", () => {
    const result = year(
      [trade("BUY", "X", "10", "1000", { ts: "2025-01-01" })],
      2025,
    );
    expect(result.gains).toEqual([]);
    expect(result.integrations).toEqual([]);
    expect(result.pending).toEqual([]);
    expect(result.computableNet).toBe("0");
  });

  it("nets a plain gain for the year of the sale", () => {
    const result = year(
      [
        trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
        trade("SELL", "X", "10", "1200", { ts: "2025-06-01" }),
      ],
      2025,
    );

    expect(result.gains).toHaveLength(1);
    const gain = result.gains[0]!;
    expect(gain.realizedPnL).toBe("200");
    expect(gain.computablePnL).toBe("200");
    expect(gain.washSale).toBeNull();
    expect(gain.lots).toHaveLength(1);
    expect(result.computableNet).toBe("200");
  });

  it("only counts a sale in the fiscal year it falls in", () => {
    const events = [
      trade("BUY", "X", "10", "1000", { ts: "2024-01-01" }),
      trade("SELL", "X", "5", "600", { ts: "2025-06-01" }),
      trade("SELL", "X", "5", "700", { ts: "2026-06-01" }),
    ];

    expect(year(events, 2025).gains).toHaveLength(1);
    expect(year(events, 2026).gains).toHaveLength(1);
    expect(year(events, 2024).gains).toHaveLength(0);
  });

  it("allows a loss with no repurchase in window", () => {
    const result = year(
      [
        trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
        trade("SELL", "X", "10", "700", { ts: "2025-06-01" }),
      ],
      2025,
    );

    expect(result.gains[0]!.washSale).toBeNull();
    expect(result.computableNet).toBe("-300");
  });

  it("a gain with a repurchase in window is never affected", () => {
    const sell = trade("SELL", "X", "10", "1300", { ts: "2025-06-01" });
    const result = year(
      [
        trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
        sell,
        trade("BUY", "X", "10", "1250", { ts: "2025-06-10" }),
        trade("BUY", "X", "10", "1250", { ts: "2025-05-20" }),
      ],
      2025,
    );

    const gain = result.gains[0]!;
    expect(gain.computablePnL).toBe("300");
    expect(gain.nonComputable).toBe("0");
    expect(gain.washSale).toBeNull();
    expect(result.computableNet).toBe("300");
  });

  it("defers the whole loss on a full repurchase and keeps it pending on the new units", () => {
    const sell = trade("SELL", "X", "10", "700", { ts: "2025-06-01" }); // -300
    const rebuy = trade("BUY", "X", "10", "750", { ts: "2025-07-01" });
    const events = [
      trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
      sell,
      rebuy,
    ];

    const result = year(events, 2025);
    const gain = result.gains[0]!;
    expect(gain.realizedPnL).toBe("-300");
    expect(gain.nonComputable).toBe("-300");
    expect(gain.computablePnL).toBe("0");
    expect(gain.washSale?.recipients).toEqual([
      {
        buyEventId: rebuy.id,
        acquiredAt: rebuy.ts,
        quantity: "10",
        deferredLoss: "-300",
      },
    ]);
    expect(result.computableNet).toBe("0");
    expect(result.pending).toEqual([
      {
        buyEventId: rebuy.id,
        acquiredAt: rebuy.ts,
        instrumentId: "X",
        pieces: [{ originEventId: sell.id, amount: "-300" }],
      },
    ]);
  });

  it("V1117-21: only the share repurchased is deferred", () => {
    const sell = trade("SELL", "X", "3008", "24064", { ts: "2025-03-01" }); // -6016
    const events = [
      trade("BUY", "X", "3008", "30080", { ts: "2024-01-15" }),
      sell,
      trade("BUY", "X", "2000", "16500", { ts: "2025-04-01" }),
    ];

    const gain = year(events, 2025).gains[0]!;
    expect(gain.nonComputable).toBe("-4000");
    expect(gain.computablePnL).toBe("-2016"); // the loss on 1,008 units
    expect(year(events, 2025).computableNet).toBe("-2016");
  });

  it("a sale at a gain with no repurchase integrates the deferred loss its units carry, in its own year", () => {
    const sell = trade("SELL", "X", "10", "700", { ts: "2025-06-01" }); // -300
    const rebuy = trade("BUY", "X", "10", "750", { ts: "2025-07-01" });
    const final = trade("SELL", "X", "10", "800", { ts: "2026-06-01" }); // +50
    const events = [
      trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
      sell,
      rebuy,
      final,
    ];

    const y2026 = year(events, 2026);
    expect(y2026.gains[0]!.computablePnL).toBe("50");
    expect(y2026.integrations).toEqual([
      {
        originEventId: sell.id,
        originTs: sell.ts,
        integratedByEventId: final.id,
        ts: final.ts,
        instrumentId: "X",
        amount: "-300",
      },
    ]);
    expect(y2026.computableNet).toBe("-250");
    expect(y2026.pending).toEqual([]);
  });

  it("V1403-21: a sale at a gain with a repurchase moves the deferred loss on, and its own gain stays whole", () => {
    const loss = trade("SELL", "X", "10", "700", { ts: "2025-06-01" }); // -300
    const rebuy1 = trade("BUY", "X", "10", "750", { ts: "2025-07-01" });
    const gainSale = trade("SELL", "X", "10", "900", { ts: "2026-06-01" }); // +150
    const rebuy2 = trade("BUY", "X", "10", "880", { ts: "2026-06-20" });
    const events = [
      trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
      loss,
      rebuy1,
      gainSale,
      rebuy2,
    ];

    const y2026 = year(events, 2026);
    const gain = y2026.gains[0]!;
    expect(gain.computablePnL).toBe("150");
    expect(gain.nonComputable).toBe("0");
    expect(gain.carriedOver).toBe("-300");
    expect(gain.washSale?.recipients).toEqual([
      {
        buyEventId: rebuy2.id,
        acquiredAt: rebuy2.ts,
        quantity: "10",
        deferredLoss: "-300",
      },
    ]);
    expect(y2026.integrations).toEqual([]);
    expect(y2026.computableNet).toBe("150");
    expect(y2026.pending).toEqual([
      {
        buyEventId: rebuy2.id,
        acquiredAt: rebuy2.ts,
        instrumentId: "X",
        pieces: [{ originEventId: loss.id, amount: "-300" }],
      },
    ]);
  });

  it("a sale at a gain partly repurchased integrates only the share not repurchased", () => {
    const loss = trade("SELL", "X", "10", "700", { ts: "2025-06-01" }); // -300
    const rebuy1 = trade("BUY", "X", "10", "750", { ts: "2025-07-01" });
    const gainSale = trade("SELL", "X", "10", "900", { ts: "2026-06-01" }); // +150
    const rebuy2 = trade("BUY", "X", "4", "352", { ts: "2026-06-20" });
    const events = [
      trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
      loss,
      rebuy1,
      gainSale,
      rebuy2,
    ];

    const y2026 = year(events, 2026);
    const gain = y2026.gains[0]!;
    expect(gain.computablePnL).toBe("150");
    expect(gain.carriedOver).toBe("-120");
    expect(y2026.integrations.map((i) => [i.originEventId, i.amount])).toEqual([
      [loss.id, "-180"],
    ]);
    expect(y2026.computableNet).toBe("-30");
    expect(y2026.pending[0]?.pieces).toEqual([
      { originEventId: loss.id, amount: "-120" },
    ]);
  });

  it("a sale at a gain carrying nothing claims no units a later loss could use", () => {
    const gainSale = trade("SELL", "X", "5", "700", { ts: "2025-03-01" }); // +200
    const buy = trade("BUY", "X", "5", "550", { ts: "2025-03-15" });
    const lossSale = trade("SELL", "X", "5", "400", { ts: "2025-04-01" }); // -100
    const events = [
      trade("BUY", "X", "10", "1000", { ts: "2024-01-01" }),
      gainSale,
      buy,
      lossSale,
    ];

    const result = year(events, 2025);
    expect(result.gains[0]!.washSale).toBeNull();
    const loss = result.gains[1]!;
    expect(loss.nonComputable).toBe("-100");
    expect(loss.washSale?.recipients.map((r) => r.buyEventId)).toEqual([
      buy.id,
    ]);
  });

  it("chains the deferral when the sale of the repurchased units trips the rule again", () => {
    const first = trade("SELL", "X", "10", "700", { ts: "2025-06-01" }); // -300
    const rebuy1 = trade("BUY", "X", "10", "750", { ts: "2025-07-01" });
    const second = trade("SELL", "X", "10", "700", { ts: "2026-06-01" }); // -50
    const rebuy2 = trade("BUY", "X", "10", "720", { ts: "2026-06-20" });
    const third = trade("SELL", "X", "10", "900", { ts: "2027-06-01" }); // +180
    const events = [
      trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
      first,
      rebuy1,
      second,
      rebuy2,
      third,
    ];

    const y2026 = year(events, 2026);
    const gain = y2026.gains[0]!;
    expect(gain.nonComputable).toBe("-50");
    expect(gain.carriedOver).toBe("-300");
    expect(gain.washSale?.recipients[0]?.deferredLoss).toBe("-350");
    expect(y2026.integrations).toEqual([]);
    expect(y2026.computableNet).toBe("0");
    expect(y2026.pending[0]?.pieces).toEqual([
      { originEventId: first.id, amount: "-300" },
      { originEventId: second.id, amount: "-50" },
    ]);

    const y2027 = year(events, 2027);
    expect(y2027.integrations.map((i) => [i.originEventId, i.amount])).toEqual([
      [first.id, "-300"],
      [second.id, "-50"],
    ]);
    expect(y2027.computableNet).toBe("-170");
  });

  it("a partial re-trigger defers again only the share repurchased", () => {
    const first = trade("SELL", "X", "10", "700", { ts: "2025-06-01" }); // -300
    const rebuy1 = trade("BUY", "X", "10", "750", { ts: "2025-07-01" });
    const second = trade("SELL", "X", "10", "700", { ts: "2026-06-01" }); // -50
    const rebuy2 = trade("BUY", "X", "4", "280", { ts: "2026-06-20" });
    const events = [
      trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
      first,
      rebuy1,
      second,
      rebuy2,
    ];

    const y2026 = year(events, 2026);
    const gain = y2026.gains[0]!;
    expect(gain.nonComputable).toBe("-20");
    expect(gain.computablePnL).toBe("-30");
    expect(gain.carriedOver).toBe("-120");
    expect(y2026.integrations.map((i) => i.amount)).toEqual(["-180"]);
    expect(y2026.computableNet).toBe("-210");
  });

  it("spreads a lot's deferral pro rata over the units of that lot", () => {
    const sell = trade("SELL", "X", "10", "700", { ts: "2025-06-01" }); // -300
    const rebuy = trade("BUY", "X", "20", "1500", { ts: "2025-07-01" }); // 10 of 20 repurchase
    const partial = trade("SELL", "X", "5", "400", { ts: "2026-01-15" }); // +25
    const events = [
      trade("BUY", "X", "10", "1000", { ts: "2025-01-01" }),
      sell,
      rebuy,
      partial,
    ];

    const y2026 = year(events, 2026);
    expect(y2026.integrations.map((i) => i.amount)).toEqual(["-75"]);
    expect(y2026.pending[0]?.pieces).toEqual([
      { originEventId: sell.id, amount: "-225" },
    ]);
  });

  it("a December loss rebought in January is deferred in the year of the sale", () => {
    const sell = trade("SELL", "X", "10", "700", {
      ts: "2025-12-15T10:00:00Z",
    });
    const rebuy = trade("BUY", "X", "10", "720", {
      ts: "2026-01-20T10:00:00Z",
    });
    const events = [
      trade("BUY", "X", "10", "1000", { ts: "2025-03-01" }),
      sell,
      rebuy,
    ];

    const y2025 = year(events, 2025);
    expect(y2025.gains[0]!.nonComputable).toBe("-300");
    expect(y2025.computableNet).toBe("0");
    expect(y2025.pending.map((p) => p.buyEventId)).toEqual([rebuy.id]);
  });

  it("a crypto loss computes whole and carries a notice when rebought within a year", () => {
    const sell = trade("SELL", "BTC", "1", "50000", { ts: "2025-05-08" });
    const rebuy = trade("BUY", "BTC", "1", "52000", { ts: "2025-05-20" });
    const events = [
      trade("BUY", "BTC", "1", "60000", { ts: "2025-01-10" }),
      sell,
      rebuy,
    ];

    const result = year(events, 2025, ["BTC"]);
    const gain = result.gains[0]!;
    expect(gain.computablePnL).toBe("-10000");
    expect(gain.washSale).toBeNull();
    expect(gain.unlistedNotice).toEqual({
      buyEventId: rebuy.id,
      buyTs: rebuy.ts,
    });
    expect(result.computableNet).toBe("-10000");
  });

  it("nets several sales in a year, mixing gains and deferred losses", () => {
    const events = [
      trade("BUY", "A", "10", "1000", { ts: "2025-01-01" }),
      trade("SELL", "A", "10", "700", { ts: "2025-03-01" }), // -300, deferred
      trade("BUY", "A", "10", "710", { ts: "2025-04-01" }),
      trade("BUY", "B", "10", "1000", { ts: "2025-01-01" }),
      trade("SELL", "B", "10", "1500", { ts: "2025-05-01" }), // +500
    ];

    const result = year(events, 2025);
    expect(result.gains).toHaveLength(2);
    expect(result.computableNet).toBe("500");
  });

  it("taxYearOf over one history agrees with computeTaxLots", () => {
    const events = [
      trade("BUY", "X", "10", "1000", { ts: "2024-01-01" }),
      trade("SELL", "X", "10", "700", { ts: "2025-06-01" }),
      trade("BUY", "X", "10", "750", { ts: "2025-07-01" }),
      trade("SELL", "X", "10", "800", { ts: "2026-06-01" }),
    ];

    const history = computeTaxHistory(events, LISTED);
    for (const y of [2024, 2025, 2026, 2027]) {
      expect(taxYearOf(history, y)).toEqual(computeTaxLots(events, y, LISTED));
    }
  });
});
