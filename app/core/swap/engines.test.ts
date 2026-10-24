import { describe, expect, it } from "vitest";

import type { LedgerEvent, TradeEvent } from "../domain";
import { walkAvco } from "../projections/avco";
import { computeCostBasisTimeline } from "../projections/cost-basis-timeline";
import {
  computePortfolioReturns,
  computeReturns,
  computeTotalContributed,
  explainPortfolioTwr,
} from "../projections/returns";
import { walkFifo } from "../tax/fifo";
import { computeTaxHistory, taxYearOf } from "../tax/tax-lots";

let seq = 0;

function trade(
  type: "BUY" | "SELL",
  instrumentId: string,
  quantity: string,
  grossAmount: string,
  ts: string,
  over: Partial<TradeEvent> = {},
): TradeEvent {
  return {
    id: `evt-${seq++}`,
    ts: new Date(ts),
    type,
    instrumentId,
    quantity,
    price: "0",
    grossAmount,
    fees: "0",
    currency: "EUR",
    account: "kraken",
    source: "KRAKEN_CSV",
    ...over,
  };
}

interface SwapSpec {
  linkId: string;
  ts: string;
  out: { id: string; quantity: string; value: string };
  in: { id: string; quantity: string; value: string; fee: string };
}

function swap(spec: SwapSpec): { sell: TradeEvent; buy: TradeEvent } {
  const link = { linkId: spec.linkId, linkKind: "swap" };
  return {
    sell: trade("SELL", spec.out.id, spec.out.quantity, spec.out.value, spec.ts, {
      ...link,
      externalId: `${spec.linkId}:sell`,
    }),
    buy: trade("BUY", spec.in.id, spec.in.quantity, spec.in.value, spec.ts, {
      ...link,
      fees: spec.in.fee,
      externalId: `${spec.linkId}:buy`,
    }),
  };
}

const CRYPTO = new Map([
  ["ETH", "fungible-crypto" as const],
  ["BTC", "fungible-crypto" as const],
]);
const taxOptions = { territory: "bizkaia" as const, assetClasses: CRYPTO };

const START = trade("BUY", "ETH", "10", "1000", "2026-01-05T10:00:00Z");

const GAIN = swap({
  linkId: "refid-gain",
  ts: "2026-03-10T10:00:00Z",
  out: { id: "ETH", quantity: "4", value: "480" },
  in: { id: "BTC", quantity: "0.0099", value: "470", fee: "5" },
});

describe("a swap through FIFO and AVCO", () => {
  const events: LedgerEvent[] = [START, GAIN.sell, GAIN.buy];

  it("transmits at the delivered value less the fee taken from what was received", () => {
    const sale = walkFifo(events).sales[0]!;
    expect(sale.gross.toString()).toBe("480");
    expect(sale.fees.toString()).toBe("5");
    expect(sale.costRemoved.toString()).toBe("400");
    expect(sale.realizedPnL.toString()).toBe("75");
  });

  it("acquires what was received at that same figure, so the fee is counted once", () => {
    const lots = walkAvco(events).lots;
    const btc = lots.get("BTC")!;
    expect(btc.costBasis.toString()).toBe("475");
    expect(btc.quantity.toString()).toBe("0.0099");
    const eth = lots.get("ETH")!;
    expect(eth.costBasis.toString()).toBe("600");
    expect(eth.realizedPnL.toString()).toBe("75");
  });

  it("gives the position a cost on the cost line: an asset got only by swap is not free", () => {
    const [point] = computeCostBasisTimeline(events, "BTC");
    expect(point?.investedAfter).toBe("475");
    expect(point?.quantityAfter).toBe("0.0099");
  });

  it("queues the received units in FIFO at that cost", () => {
    const lot = walkFifo(events).lots.get("BTC")![0]!;
    expect(lot.unitCost.scaleBy("0.0099").toString()).toBe("475");
  });
});

describe("a swap and Art. 43.i", () => {
  const LOSS = swap({
    linkId: "refid-loss",
    ts: "2026-03-10T10:00:00Z",
    out: { id: "ETH", quantity: "4", value: "360" },
    in: { id: "BTC", quantity: "0.0099", value: "355", fee: "5" },
  });

  it("treats the sale at a loss like any crypto transmission: a purchase in the next two months defers it in proportion", () => {
    const rebuy = trade("BUY", "ETH", "3", "330", "2026-04-01T10:00:00Z");
    const history = computeTaxHistory(
      [START, LOSS.sell, LOSS.buy, rebuy],
      taxOptions,
    );
    const gain = history.gains.find((g) => g.eventId === LOSS.sell.id)!;
    expect(gain.realizedPnL).toBe("-45");
    expect(gain.washSale?.letter).toBe("i");
    expect(gain.nonComputable).toBe("-33.75");
    expect(gain.computablePnL).toBe("-11.25");
    expect(gain.washSale?.recipients.map((r) => r.buyEventId)).toEqual([
      rebuy.id,
    ]);
  });

  it("counts the leg received as an acquisition of the asset it brings", () => {
    const older = trade("BUY", "BTC", "0.1", "5000", "2025-06-01T10:00:00Z");
    const sale = trade("SELL", "BTC", "0.05", "2000", "2026-03-20T10:00:00Z");
    const history = computeTaxHistory(
      [older, START, GAIN.sell, GAIN.buy, sale],
      taxOptions,
    );
    const gain = history.gains.find((g) => g.eventId === sale.id)!;
    expect(gain.realizedPnL).toBe("-500");
    expect(gain.washSale?.repurchaseBefore).toBe("0.0099");
    expect(gain.washSale?.recipients.map((r) => r.buyEventId)).toContain(
      GAIN.buy.id,
    );
  });

  it("reaches a year with no tax scale through the same engine", () => {
    const early = swap({
      linkId: "refid-2025",
      ts: "2025-03-10T10:00:00Z",
      out: { id: "ETH", quantity: "4", value: "480" },
      in: { id: "BTC", quantity: "0.0099", value: "470", fee: "5" },
    });
    const start = trade("BUY", "ETH", "10", "1000", "2025-01-05T10:00:00Z");
    const year = taxYearOf(
      computeTaxHistory([start, early.sell, early.buy], taxOptions),
      2025,
    );
    expect(year.gains).toHaveLength(1);
    expect(year.gains[0]?.realizedPnL).toBe("75");
  });
});

describe("a swap moves no money across the portfolio's edge", () => {
  const without: LedgerEvent[] = [START];
  const withSwap: LedgerEvent[] = [START, GAIN.sell, GAIN.buy];
  const NOW = new Date("2026-06-10T10:00:00Z");
  const series = [
    { t: Date.parse("2026-01-05T10:00:00Z"), invested: "1000", value: "1000" },
    { t: Date.parse("2026-03-10T10:00:00Z"), invested: "1000", value: "1100" },
    { t: NOW.getTime(), invested: "1000", value: "1200" },
  ];

  it("leaves Total contributed alone", () => {
    expect(computeTotalContributed(withSwap)).toBe(
      computeTotalContributed(without),
    );
  });

  it("leaves portfolio MWR and TWR alone", () => {
    expect(computePortfolioReturns(withSwap, series)).toEqual(
      computePortfolioReturns(without, series),
    );
    expect(explainPortfolioTwr(withSwap, series)).toEqual(
      explainPortfolioTwr(without, series),
    );
  });

  it("keeps the legs out of an instrument's purchases but in its own cash flows", () => {
    const btc = computeReturns(withSwap, "BTC", "50000", NOW);
    expect(btc.totalInvested).toBe("0");
    expect(btc.buyCount).toBe(0);
    expect(btc.mwr).not.toBeNull();
    const eth = computeReturns(withSwap, "ETH", "100", NOW);
    expect(eth.totalInvested).toBe("1000");
    expect(eth.buyCount).toBe(1);
  });
});
