import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { historyInBase, pricesInBase, rateBookFrom } from "../../app/core/fx";
import type { FxRate } from "../../app/core/ports";
import {
  computeCostBasisTimeline,
  computeInvestedVsValueSeries,
  computePortfolioInvestedVsValueSeries,
} from "../../app/core/projections";
import { jurisdictionOf, sortTrades } from "../../app/core/tax";

import { contractJson, eventsOf, ledger, rate, usd, type Row } from "./build";

interface Quote {
  instrumentId: string;
  price: string;
  currency: string;
  asOf: string;
}

export interface SeriesInput {
  name: string;
  residence: "bizkaia";
  now: string;
  events: Row[];
  histories: Quote[];
  currentPrices: Quote[];
  rates: FxRate[];
}

const FUND = "IE00TEST0401";
const BOND = "IE00TEST0402";
const USD_STOCK = "US00TEST0403";

const { trade } = ledger();

const quote = (
  instrumentId: string,
  price: string,
  asOf: string,
  currency = "EUR",
): Quote => ({ instrumentId, price, currency, asOf });

const cases: (SeriesInput & {
  byHand?: { arithmetic: string; figures: Record<string, string | null> };
})[] = [
  {
    name: "The cost line of one instrument through purchases and sales with fees, with a close stamped at the instant of a trade",
    residence: "bizkaia",
    now: "2025-06-30T17:00:00.000Z",
    events: [
      trade("BUY", FUND, "2025-01-13T09:00:00.000Z", "10", "1000", {
        fees: "1",
      }),
      trade("BUY", FUND, "2025-02-10T09:00:00.000Z", "5", "600", { fees: "1" }),
      trade("SELL", FUND, "2025-03-10T09:00:00.000Z", "6", "720", {
        fees: "1",
      }),
      trade("SELL", FUND, "2025-04-07T09:00:00.000Z", "9", "1035"),
      trade("BUY", FUND, "2025-05-05T09:00:00.000Z", "4", "460"),
    ],
    histories: [
      quote(FUND, "100", "2025-01-13T09:00:00.000Z"),
      quote(FUND, "112", "2025-02-28T16:30:00.000Z"),
      quote(FUND, "118", "2025-03-31T16:30:00.000Z"),
      quote(FUND, "116", "2025-05-30T16:30:00.000Z"),
    ],
    currentPrices: [quote(FUND, "120", "2025-06-30T16:30:00.000Z")],
    rates: [],
    byHand: {
      arithmetic:
        "15 units cost 1602 (106.8 each); selling 6 leaves 9 costing 961.2 at the same 106.8. Selling the 9 empties the position, cost 0. Buying 4 for 460 starts again at 115. The close stamped at 09:00 on 13 January comes after that instant's purchase, so it values 10 units: 1000. Today 4 × 120 = 480 against 460 invested.",
      figures: {
        "instruments.IE00TEST0401.timeline.1.avgCostAfter": "106.8",
        "instruments.IE00TEST0401.timeline.2.investedAfter": "961.2",
        "instruments.IE00TEST0401.timeline.3.investedAfter": "0",
        "instruments.IE00TEST0401.timeline.4.avgCostAfter": "115",
        "instruments.IE00TEST0401.series.1.value": "1000",
        "portfolio.8.value": "480",
        "portfolio.8.invested": "460",
      },
    },
  },
  {
    name: "Two instruments whose closes fall on different days: the merged line carries each one's last value across the other's gaps",
    residence: "bizkaia",
    now: "2025-04-30T17:00:00.000Z",
    events: [
      trade("BUY", FUND, "2025-03-03T09:00:00.000Z", "10", "1000"),
      trade("BUY", BOND, "2025-03-04T09:00:00.000Z", "20", "1000"),
    ],
    histories: [
      quote(FUND, "102", "2025-03-14T16:30:00.000Z"),
      quote(FUND, "104", "2025-03-28T16:30:00.000Z"),
      quote(BOND, "50.5", "2025-03-21T16:30:00.000Z"),
    ],
    currentPrices: [
      quote(FUND, "105", "2025-04-30T16:30:00.000Z"),
      quote(BOND, "51", "2025-04-30T16:30:00.000Z"),
    ],
    rates: [],
    byHand: {
      arithmetic:
        "On 21 March only the bond has a close (20 × 50.5 = 1010); the fund carries its 14 March value, 10 × 102 = 1020: 2030. On 28 March only the fund has one (1040); the bond carries 1010: 2050. Today 1050 + 1020 = 2070 against 2000.",
      figures: {
        "portfolio.3.value": "2030",
        "portfolio.4.value": "2050",
        "portfolio.5.value": "2070",
        "portfolio.5.invested": "2000",
      },
    },
  },
  {
    name: "A line quoted in USD: each close at the rate of its own Madrid day, the last rate within a week, and a close with none left out",
    residence: "bizkaia",
    now: "2025-03-31T21:30:00.000Z",
    events: [
      trade("BUY", USD_STOCK, "2025-02-03T15:00:00.000Z", "10", "1040", {
        fees: "1.04",
        ...usd("2025-02-03", "1.04"),
      }),
    ],
    histories: [
      quote(USD_STOCK, "105", "2025-02-03T21:00:00.000Z", "USD"),
      quote(USD_STOCK, "110", "2025-02-28T21:00:00.000Z", "USD"),
      quote(USD_STOCK, "108", "2025-03-03T21:00:00.000Z", "USD"),
      quote(USD_STOCK, "112", "2025-03-24T21:00:00.000Z", "USD"),
    ],
    currentPrices: [quote(USD_STOCK, "115.5", "2025-03-31T20:00:00.000Z", "USD")],
    rates: [
      rate("USD", "2025-02-03", "1.05"),
      rate("USD", "2025-02-28", "1.1"),
      rate("USD", "2025-03-31", "1.1"),
    ],
  },
];

export function evaluate(input: SeriesInput) {
  const jurisdiction = jurisdictionOf(input.residence);
  const events = eventsOf(input.events);
  const book = rateBookFrom(input.rates);
  const now = new Date(input.now);
  const current = pricesInBase(
    new Map(input.currentPrices.map((p) => [p.instrumentId, p])),
    book,
    now,
    jurisdiction.zone,
  );
  const ids = [...new Set(sortTrades(events).map((t) => t.instrumentId))];

  const instruments = ids.map((id) => {
    const inBase = historyInBase(
      input.histories
        .filter((q) => q.instrumentId === id)
        .map((q) => ({ ...q, asOf: new Date(q.asOf), source: "TEST" })),
      book,
      jurisdiction.zone,
    );
    const series = computeInvestedVsValueSeries(
      events,
      id,
      inBase.history.map((s) => ({ asOf: s.asOf, price: s.price })),
      current.prices.get(id)?.price ?? null,
      now,
      jurisdiction,
    );
    return {
      id,
      historyInBase: inBase,
      timeline: computeCostBasisTimeline(events, id, jurisdiction),
      series,
    };
  });

  return {
    currentInBase: {
      prices: Object.fromEntries(current.prices),
      unrated: Object.fromEntries(current.unrated),
    },
    instruments: Object.fromEntries(
      instruments.map(({ id, ...rest }) => [id, rest]),
    ),
    portfolio: computePortfolioInvestedVsValueSeries(
      instruments.map((i) => i.series),
    ),
  };
}

export const SERIES_CONTRACT_FILE = fileURLToPath(
  new URL("./series.json", import.meta.url),
);

export function seriesContractJson(): string {
  return contractJson(
    "series",
    "The chart lines: an instrument's AVCO cost line (computeCostBasisTimeline), its value against what is invested (computeInvestedVsValueSeries) and the portfolio's merge of those (computePortfolioInvestedVsValueSeries), with prices brought to euros first: each close at the last rate published on or before its own Madrid day and at most 7 days old (historyInBase), today's price at today's (pricesInBase); a close with no such rate is left out and counted in unrated. Instruments come in the order of their first trade, trades by instant, then BUY before SELL, then externalId, then id. A value series has one point per trade and per close at or after the first trade, plus today when there is a price, ordered by t; a trade comes before a close at the same t, and closes sharing a t keep the order given (history, then today). Each point is the last trade's invested and quantity times the point's price. The merge has one point per distinct t across instruments, each instrument contributing its last point at or before that t and nothing before its first. Shared with the mobile client: both implementations must reproduce every case. Events are LedgerEvents; an absent fxSource is IDENTITY and an absent funding is CASH. expect is written by running the TypeScript core; byHand.figures, where a case has it, are worked out by hand, its arithmetic says how, and each key is a dotted path into expect.",
    cases.map(({ byHand, ...input }) => ({
      ...input,
      ...(byHand ? { byHand } : {}),
      expect: evaluate(input),
    })),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(SERIES_CONTRACT_FILE, seriesContractJson());
}
