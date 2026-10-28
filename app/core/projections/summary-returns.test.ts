import { describe, expect, it } from "vitest";

import { Money, type LedgerEvent, type TradeEvent } from "../domain";
import { computeInvestedVsValueSeries } from "./invested-vs-value";
import { computeMarketValues } from "./market-value";
import {
  computePortfolioInvestedVsValueSeries,
  computePortfolioSummary,
  unpricedOpenIds,
} from "./portfolio";
import { computePositions } from "./positions";
import {
  computePortfolioReturns,
  computeReturns,
  computeTotalContributed,
  explainPortfolioTwr,
  periodReturns,
  withoutInstruments,
} from "./returns";
import { YEAR_MS } from "./xirr";
import { jurisdictionOf } from "~/core/tax";

const BIZKAIA = jurisdictionOf("bizkaia");

function trade(
  o: Partial<TradeEvent> &
    Pick<TradeEvent, "ts" | "grossAmount" | "quantity" | "instrumentId">,
): TradeEvent {
  return {
    id: crypto.randomUUID(),
    type: "BUY",
    currency: "EUR",
    account: "trade-republic",
    source: "trade-republic",
    price: "0",
    fees: "0",
    ...o,
  };
}

type History = Record<string, { asOf: Date; price: string }[]>;

const NOW = new Date("2027-01-01T00:00:00Z");

function summarise(
  events: readonly LedgerEvent[],
  latest: Record<string, string>,
  history: History = {},
) {
  const positions = computePositions(events, BIZKAIA);
  const prices = new Map(
    Object.entries(latest).map(([id, price]) => [
      id,
      { price, currency: "EUR" },
    ]),
  );
  const marketValues = computeMarketValues(positions, prices, "EUR");
  const summary = computePortfolioSummary(positions, marketValues);
  const unpriced = unpricedOpenIds(positions, marketValues);
  const included = withoutInstruments(events, unpriced);
  const series = seriesFor(included, latest, history, unpriced);
  return {
    summary,
    unpriced,
    included,
    series,
    returns: computePortfolioReturns(included, series),
    totalContributed: computeTotalContributed(events),
  };
}

function seriesFor(
  events: readonly LedgerEvent[],
  latest: Record<string, string>,
  history: History,
  skip: ReadonlySet<string> = new Set(),
) {
  const ids = [
    ...new Set(computePositions(events, BIZKAIA).map((p) => p.instrumentId)),
  ].filter((id) => !skip.has(id));
  return computePortfolioInvestedVsValueSeries(
    ids.map((id) =>
      computeInvestedVsValueSeries(
        events,
        id,
        history[id] ?? [],
        latest[id] ?? null,
        NOW,
        BIZKAIA,
      ),
    ),
  );
}

const A_BUY = trade({
  instrumentId: "A",
  ts: new Date("2026-01-01T00:00:00Z"),
  quantity: "10",
  grossAmount: "1000",
  fees: "1",
});
const B_BUY = trade({
  instrumentId: "B",
  ts: new Date("2026-03-01T00:00:00Z"),
  quantity: "5",
  grossAmount: "500",
});

describe("summary over unpriced positions", () => {
  it("with nothing priced: cost of what you hold is everything, value and returns nothing", () => {
    const r = summarise([A_BUY, B_BUY], {});

    expect(r.summary.openCost).toBe("1501");
    expect(r.summary.pricedCost).toBe("0");
    expect(r.summary.unpricedCost).toBe("1501");
    expect(r.summary.totalValue).toBe("0");
    expect(r.summary.returnPct).toBeNull();
    expect(r.summary.unpricedCount).toBe(2);
    expect(r.series).toEqual([]);
    expect(r.returns.twr).toBeNull();
    expect(r.returns.mwr).toBeNull();
    expect(r.returns.period.since).toBeNull();
  });

  it("with part priced: value and result over the priced part, returns as if the rest were never bought", () => {
    const r = summarise([A_BUY, B_BUY], { A: "120" });
    const aloneEvents = [A_BUY];
    const alone = computePortfolioReturns(
      aloneEvents,
      seriesFor(aloneEvents, { A: "120" }, {}),
    );

    expect(r.summary.openCost).toBe("1501");
    expect(r.summary.pricedCost).toBe("1001");
    expect(r.summary.totalInvested).toBe("1001");
    expect(r.summary.unpricedCost).toBe("500");
    expect(r.summary.totalValue).toBe("1200");
    expect(r.summary.unrealizedPnL).toBe("199");
    expect(r.summary.pricedCount).toBe(1);
    expect(r.summary.unpricedCount).toBe(1);
    expect([...r.unpriced]).toEqual(["B"]);
    expect(r.returns).toEqual(alone);
    expect(r.returns.period.since).toBe(A_BUY.ts.getTime());
    expect(r.series.at(-1)?.invested).toBe("1001");
  });

  it("drops an open unpriced instrument's partial sales too", () => {
    const sale = trade({
      instrumentId: "B",
      type: "SELL",
      ts: new Date("2026-06-01T00:00:00Z"),
      quantity: "2",
      grossAmount: "260",
    });
    const r = summarise([A_BUY, B_BUY, sale], { A: "120" });

    expect(r.included).toEqual([A_BUY]);
    expect(r.summary.realizedPnL).toBe("60");
  });

  it("keeps closed unpriced positions in the returns while leaving their cost out of what you hold", () => {
    const closedBuy = trade({
      instrumentId: "C",
      ts: new Date("2025-06-01T00:00:00Z"),
      quantity: "4",
      grossAmount: "400",
    });
    const closedSell = trade({
      instrumentId: "C",
      type: "SELL",
      ts: new Date("2025-12-01T00:00:00Z"),
      quantity: "4",
      grossAmount: "480",
    });
    const events = [closedBuy, closedSell, A_BUY];
    const r = summarise(events, { A: "120" });
    const aloneEvents = [A_BUY];
    const alone = computePortfolioReturns(
      aloneEvents,
      seriesFor(aloneEvents, { A: "120" }, {}),
    );

    expect(r.unpriced.size).toBe(0);
    expect(r.included).toEqual(events);
    expect(r.summary.openCost).toBe("1001");
    expect(r.summary.unpricedCount).toBe(0);
    expect(r.totalContributed).toBe("1401");
    expect(r.returns.period.since).toBe(closedBuy.ts.getTime());
    expect(r.returns.mwr).not.toBe(alone.mwr);
    expect(r.returns.twr).not.toBeNull();
  });

  it("with everything priced: the figures are what they were, only the labels move", () => {
    const events = [A_BUY, B_BUY];
    const latest = { A: "120", B: "110" };
    const r = summarise(events, latest);

    expect(r.unpriced.size).toBe(0);
    expect(r.included).toEqual(events);
    expect(r.summary.openCost).toBe(r.summary.totalInvested);
    expect(r.summary.pricedCost).toBe(r.summary.totalInvested);
    expect(r.summary.unpricedCost).toBe("0");
    expect(r.totalContributed).toBe("1501");
    expect(r.returns).toEqual(
      computePortfolioReturns(events, seriesFor(events, latest, {})),
    );
  });
});

describe("one excluded set for the series and the flows", () => {
  const history: History = {
    A: [
      { asOf: new Date("2026-02-01T00:00:00Z"), price: "105" },
      { asOf: new Date("2026-04-01T00:00:00Z"), price: "110" },
      { asOf: new Date("2026-08-01T00:00:00Z"), price: "115" },
    ],
  };
  const bigB = trade({
    instrumentId: "B",
    ts: new Date("2026-03-01T00:00:00Z"),
    quantity: "100",
    grossAmount: "10000",
  });

  it("links without a jump when an unpriced instrument is excluded", () => {
    const r = summarise([A_BUY, bigB], { A: "120" }, history);
    const alone = computePortfolioReturns(
      [A_BUY],
      seriesFor([A_BUY], { A: "120" }, history),
    );

    for (const row of explainPortfolioTwr(r.included, r.series)) {
      if (row.ratio === null) continue;
      expect(Number(row.ratio)).toBeGreaterThan(0.9);
      expect(Number(row.ratio)).toBeLessThan(1.1);
    }
    expect(r.returns.twr).toBe(alone.twr);
    expect(r.returns.twr).toBe("0.200000");
  });

  it("breaks if the series drops the instrument but the flows keep it", () => {
    const events = [A_BUY, bigB];
    const series = seriesFor(events, { A: "120" }, history, new Set(["B"]));

    expect(computePortfolioReturns(events, series).twr).not.toBe("0.200000");
  });
});

describe("periodReturns", () => {
  const since = new Date("2026-01-01T00:00:00Z").getTime();

  it("annualises TWR and compounds MWR over a year or more", () => {
    const p = periodReturns("0.210000", "0.100000", since, since + 2 * YEAR_MS);

    expect(p.annualized).toBe(true);
    expect(p.twr.annual).toBe("0.100000");
    expect(p.mwr.cumulative).toBe("0.210000");
  });

  it("states the period return under a year, as (1 + IRR)^years − 1", () => {
    const p = periodReturns("0.050000", "0.210000", since, since + YEAR_MS / 2);

    expect(p.annualized).toBe(false);
    expect(p.twr.cumulative).toBe("0.050000");
    expect(p.mwr.cumulative).toBe("0.100000");
  });

  it("refuses a rate at or below −100%", () => {
    const p = periodReturns("-1", "-1", since, since + 2 * YEAR_MS);

    expect(p.twr.annual).toBeNull();
    expect(p.mwr.cumulative).toBeNull();
  });
});

describe("exactly one year", () => {
  const buy = trade({
    instrumentId: "A",
    ts: new Date("2026-01-01T00:00:00Z"),
    quantity: "10",
    grossAmount: "1000",
  });

  function both(at: number) {
    const now = new Date(at);
    const instrument = computeReturns([buy], "A", "110", now).period;
    const portfolio = computePortfolioReturns(
      [buy],
      computeInvestedVsValueSeries([buy], "A", [], "110", now, BIZKAIA),
    ).period;
    return { instrument, portfolio };
  }

  it("is annual on both screens, with the same figures", () => {
    const { instrument, portfolio } = both(buy.ts.getTime() + YEAR_MS);

    expect(instrument).toEqual(portfolio);
    expect(instrument.annualized).toBe(true);
    expect(instrument.twr.annual).toBe("0.100000");
    expect(instrument.mwr.annual).toBe("0.100000");
  });

  it("is a period return on both screens one millisecond earlier", () => {
    const { instrument, portfolio } = both(buy.ts.getTime() + YEAR_MS - 1);

    expect(instrument).toEqual(portfolio);
    expect(instrument.annualized).toBe(false);
  });
});

describe("computeReturns on a closed position", () => {
  it("needs no current price once nothing is held", () => {
    const events = [
      trade({
        instrumentId: "C",
        ts: new Date("2026-01-01T00:00:00Z"),
        quantity: "4",
        grossAmount: "400",
      }),
      trade({
        instrumentId: "C",
        type: "SELL",
        ts: new Date("2026-07-01T00:00:00Z"),
        quantity: "4",
        grossAmount: "440",
      }),
    ];
    const r = computeReturns(events, "C", null, NOW);

    expect(r.twr).toBe("0.100000");
    expect(r.mwr).not.toBeNull();
  });
});

describe("computeTotalContributed", () => {
  it("restates every purchase at its own date, sold or not", () => {
    const sale = trade({
      instrumentId: "A",
      type: "SELL",
      ts: new Date("2026-05-01T00:00:00Z"),
      quantity: "10",
      grossAmount: "1300",
    });
    const doubleBeforeMarch = (money: Money, ts: Date) =>
      ts < new Date("2026-02-01T00:00:00Z") ? money.add(money) : money;

    expect(computeTotalContributed([A_BUY, B_BUY, sale])).toBe("1501");
    expect(
      computeTotalContributed([A_BUY, B_BUY, sale], doubleBeforeMarch),
    ).toBe("2502");
  });

  it("leaves out what arrived in kind: no money left the bank for it", () => {
    const reward = { ...B_BUY, id: "reward", funding: "IN_KIND" as const };
    expect(computeTotalContributed([A_BUY, B_BUY, reward])).toBe(
      computeTotalContributed([A_BUY, B_BUY]),
    );
  });
});
