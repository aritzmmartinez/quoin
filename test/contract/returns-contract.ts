import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import Decimal from "decimal.js";

import {
  compareTrades,
  isInKind,
  isSwapLeg,
  type LedgerEvent,
  type TradeEvent,
} from "../../app/core/domain";
import { baseOf, bookable } from "../../app/core/fx";
import {
  computePortfolioReturns,
  computeReturns,
  computeTotalContributed,
  explainPortfolioTwr,
  periodReturns,
  xirr,
  YEAR_MS,
  type CashFlow,
  type InvestedVsValuePoint,
  type PeriodReturns,
} from "../../app/core/projections";
import { sortByTime } from "../../app/core/series";
import type { Range } from "../../app/lib/range";
import { filterByRange } from "../../app/lib/range";
import { computeHeroChange, computeRangeChange } from "../../app/lib/summary";

import {
  assertClearOfRounding,
  contractJson,
  eventsOf,
  ledger,
  type Row,
} from "./build";

interface InstrumentCase {
  kind: "instrument";
  events: Row[];
  instrumentId: string;
  currentPrice: string | null;
  now: string;
}

interface PortfolioCase {
  kind: "portfolio";
  events: Row[];
  valueSeries: InvestedVsValuePoint[];
  now: string;
  range: Range;
  summary: { unrealizedPnL: string; returnPct: string };
}

interface XirrCase {
  kind: "xirr";
  flows: CashFlow[];
}

interface PeriodCase {
  kind: "period";
  twr: string | null;
  mwr: string | null;
  since: number | null;
  to: number;
}

export type ReturnsInput = { name: string } & (
  | InstrumentCase
  | PortfolioCase
  | XirrCase
  | PeriodCase
);

const FUND = "IE00TEST0301";
const STOCK = "US00TEST0302";

const { trade } = ledger();

const ms = (iso: string): number => Date.parse(iso);
const point = (
  iso: string,
  invested: string,
  value: string,
): InvestedVsValuePoint => ({ t: ms(iso), invested, value });

const cases: (ReturnsInput & {
  byHand?: { arithmetic: string; figures: Record<string, string | null> };
})[] = [
  {
    name: "One instrument over more than a year: monthly buys with fees, a sale and units received in kind",
    kind: "instrument",
    events: [
      trade("BUY", FUND, "2024-03-01T09:00:00.000Z", "10", "1000", {
        fees: "1",
      }),
      trade("BUY", FUND, "2024-04-02T09:00:00.000Z", "8", "880", {
        fees: "1",
      }),
      trade("BUY", FUND, "2024-05-02T09:00:00.000Z", "0.25", "27.5", {
        funding: "IN_KIND",
      }),
      trade("SELL", FUND, "2024-11-04T09:00:00.000Z", "4", "420", {
        fees: "1",
      }),
      trade("BUY", FUND, "2025-01-02T09:00:00.000Z", "5", "500", {
        fees: "1",
      }),
    ],
    instrumentId: FUND,
    currentPrice: "112",
    now: "2025-07-15T15:00:00.000Z",
    byHand: {
      arithmetic:
        "Contributed: the three cash buys with their fees, 1001 + 881 + 501 = 2383; the in-kind units are not a contribution. TWR chains the trade prices while something is held, 100 → 110 → 110 → 105 → 100, then today's 112; the links telescope to 112 / 100, so 0.12.",
      figures: {
        "returns.totalInvested": "2383",
        "returns.twr": "0.120000",
        totalContributed: "2383",
      },
    },
  },
  {
    name: "One instrument for less than a year, closed: no price needed, and the period return is the cumulative one",
    kind: "instrument",
    events: [
      trade("BUY", STOCK, "2025-02-03T15:00:00.000Z", "4", "400", {
        fees: "2",
      }),
      trade("SELL", STOCK, "2025-06-02T15:00:00.000Z", "4", "460", {
        fees: "2",
      }),
    ],
    instrumentId: STOCK,
    currentPrice: null,
    now: "2025-08-01T10:00:00.000Z",
  },
  {
    name: "The portfolio over more than a year: a link that starts on cents, units received in kind inside TWR and outside MWR, and the change over the last six months",
    kind: "portfolio",
    events: [
      trade("BUY", FUND, "2024-01-10T09:00:00.000Z", "0.001", "0.1"),
      trade("BUY", FUND, "2024-02-01T09:00:00.000Z", "10", "1000"),
      trade("BUY", FUND, "2024-06-03T09:00:00.000Z", "0.5", "52", {
        funding: "IN_KIND",
      }),
      trade("SELL", FUND, "2024-09-02T09:00:00.000Z", "2", "230", {
        fees: "1",
      }),
      trade("BUY", STOCK, "2025-03-03T15:00:00.000Z", "5", "500", {
        fees: "1",
      }),
    ],
    valueSeries: [
      point("2024-01-10T09:00:00.000Z", "0.1", "0.1"),
      point("2024-01-31T16:30:00.000Z", "0.1", "0.13"),
      point("2024-02-01T09:00:00.000Z", "1000.1", "1000.13"),
      point("2024-05-31T16:30:00.000Z", "1000.1", "1080"),
      point("2024-06-03T09:00:00.000Z", "1052.1", "1134"),
      point("2024-09-02T09:00:00.000Z", "852.39", "943"),
      point("2024-12-31T16:30:00.000Z", "852.39", "990"),
      point("2025-03-03T15:00:00.000Z", "1353.39", "1512"),
      point("2025-06-30T16:30:00.000Z", "1353.39", "1580"),
    ],
    now: "2025-06-30T17:00:00.000Z",
    range: "6m",
    summary: { unrealizedPnL: "226.61", returnPct: "0.167439" },
    byHand: {
      arithmetic:
        "The first link runs on 10 cents: 0.13 / 0.1 = 1.3, thirty per cent on three cents, which then multiplies every later link. The next link carries the 1000 bought: (1000.13 − 1000) / 0.13 = 1. The in-kind 52 is a flow for TWR: (1134 − 52) / 1080. Six months back from 30 June 2025 at 17:00 is 30 December 2024 at 17:00, so the range starts at 31 December: P&L there 990 − 852.39 = 137.61, at the end 1580 − 1353.39 = 226.61, a change of 89 over the 1353.39 invested at the end.",
      figures: {
        "twr.0.ratio": "1.3",
        "twr.1.flow": "1000",
        "twr.1.ratio": "1",
        "twr.3.flow": "52",
        "rangeChange.abs": "89",
        "heroChange.abs": "89",
      },
    },
  },
  {
    name: "The portfolio for less than a year, with a sale and a purchase at one instant and two value points sharing an instant, kept in the order given",
    kind: "portfolio",
    events: [
      trade("BUY", FUND, "2025-01-13T09:00:00.000Z", "10", "1000"),
      trade("BUY", STOCK, "2025-03-03T15:00:00.000Z", "2", "200"),
      trade("SELL", FUND, "2025-03-03T15:00:00.000Z", "2", "210"),
    ],
    valueSeries: [
      point("2025-01-13T09:00:00.000Z", "1000", "1000"),
      point("2025-03-03T15:00:00.000Z", "1000", "1050"),
      point("2025-03-03T15:00:00.000Z", "1000", "1040"),
      point("2025-05-30T16:30:00.000Z", "1000", "1100"),
    ],
    now: "2025-05-30T17:00:00.000Z",
    range: "all",
    summary: { unrealizedPnL: "100", returnPct: "0.100000" },
  },
  {
    name: "XIRR of flows that all carry the same sign is null",
    kind: "xirr",
    flows: [
      { t: ms("2024-01-01T00:00:00.000Z"), amount: -1000 },
      { t: ms("2024-07-01T00:00:00.000Z"), amount: -500 },
    ],
  },
  {
    name: "XIRR of a single flow is null",
    kind: "xirr",
    flows: [{ t: ms("2024-01-01T00:00:00.000Z"), amount: -1000 }],
  },
  {
    name: "XIRR of three flows that converges",
    kind: "xirr",
    flows: [
      { t: ms("2024-01-02T09:00:00.000Z"), amount: -1000 },
      { t: ms("2024-06-03T09:00:00.000Z"), amount: -500.5 },
      { t: ms("2025-04-01T16:00:00.000Z"), amount: 1712.34 },
    ],
  },
  {
    name: "Period returns: under a year the MWR is restated as the period's, over a year the TWR as an annual figure, and null stays null",
    kind: "period",
    twr: "0.25",
    mwr: "0.1",
    since: ms("2025-01-01T00:00:00.000Z"),
    to: ms("2025-07-02T12:00:00.000Z"),
  },
  {
    name: "Period returns over three years, with no MWR",
    kind: "period",
    twr: "0.5",
    mwr: null,
    since: ms("2022-03-01T00:00:00.000Z"),
    to: ms("2025-03-01T00:00:00.000Z"),
  },
];

function trades(events: readonly LedgerEvent[]): TradeEvent[] {
  return bookable(events)
    .filter((e): e is TradeEvent => e.type === "BUY" || e.type === "SELL")
    .sort(compareTrades);
}

function cashFlow(t: TradeEvent): CashFlow {
  const gross = new Decimal(baseOf(t, "grossAmount").toString());
  const fees = new Decimal(baseOf(t, "fees").toString());
  return {
    t: t.ts.getTime(),
    amount:
      t.type === "BUY"
        ? -gross.plus(fees).toNumber()
        : gross.minus(fees).toNumber(),
  };
}

/** Solves the flows the description states and refuses a case whose rate sits on a rounding boundary or disagrees with the core's. */
function guardMwr(
  flows: CashFlow[],
  terminal: CashFlow,
  stated: string | null,
  label: string,
): void {
  const all = terminal.amount === 0 ? flows : [...flows, terminal];
  const rate = xirr(all);
  assertClearOfRounding(rate, label);
  const rounded = rate === null ? null : new Decimal(rate).toFixed(6);
  if (rounded !== stated) {
    throw new Error(`${label}: flows give ${rounded}, the core ${stated}`);
  }
}

function guardPeriod(period: PeriodReturns, to: number, label: string): void {
  if (period.since === null) return;
  const years = (to - period.since) / YEAR_MS;
  const growth = (rate: string | null, exponent: number) =>
    rate === null
      ? null
      : new Decimal(rate).plus(1).pow(exponent).minus(1);
  assertClearOfRounding(growth(period.twr.cumulative, 1 / years), `${label} twr.annual`);
  assertClearOfRounding(growth(period.mwr.annual, years), `${label} mwr.cumulative`);
}

export function evaluate(input: ReturnsInput) {
  switch (input.kind) {
    case "instrument": {
      const events = eventsOf(input.events);
      const now = new Date(input.now);
      const returns = computeReturns(
        events,
        input.instrumentId,
        input.currentPrice,
        now,
      );
      const own = trades(events).filter(
        (t) => t.instrumentId === input.instrumentId,
      );
      const held = own.reduce(
        (q, t) => (t.type === "BUY" ? q.plus(t.quantity) : q.minus(t.quantity)),
        new Decimal(0),
      );
      guardMwr(
        own.filter((t) => !isInKind(t)).map(cashFlow),
        {
          t: now.getTime(),
          amount: new Decimal(input.currentPrice ?? 0).mul(held).toNumber(),
        },
        returns.mwr,
        input.name,
      );
      guardPeriod(returns.period, now.getTime(), input.name);
      return { returns, totalContributed: computeTotalContributed(events) };
    }
    case "portfolio": {
      const events = eventsOf(input.events);
      const now = new Date(input.now);
      const returns = computePortfolioReturns(events, input.valueSeries);
      const last = sortByTime(input.valueSeries).at(-1);
      if (last) {
        guardMwr(
          trades(events)
            .filter((t) => !isSwapLeg(t) && !isInKind(t))
            .map(cashFlow),
          { t: last.t, amount: new Decimal(last.value).toNumber() },
          returns.mwr,
          input.name,
        );
        guardPeriod(returns.period, last.t, input.name);
      }
      const ranged = filterByRange(input.valueSeries, input.range, now);
      return {
        twr: explainPortfolioTwr(events, input.valueSeries),
        returns,
        totalContributed: computeTotalContributed(events),
        rangeSeries: ranged,
        rangeChange: computeRangeChange(ranged),
        heroChange: computeHeroChange(input.range, ranged, input.summary),
      };
    }
    case "xirr": {
      const rate = xirr(input.flows);
      assertClearOfRounding(rate, input.name);
      return { rate: rate === null ? null : new Decimal(rate).toFixed(6) };
    }
    case "period": {
      const period = periodReturns(input.twr, input.mwr, input.since, input.to);
      guardPeriod(period, input.to, input.name);
      return period;
    }
  }
}

export const RETURNS_CONTRACT_FILE = fileURLToPath(
  new URL("./returns.json", import.meta.url),
);

export function returnsContractJson(): string {
  return contractJson(
    "returns",
    "Returns: TWR (how the asset did, from price marks, fees excluded) and MWR/XIRR (how the money did, fees included), on one instrument (computeReturns) and on the portfolio (computePortfolioReturns, with explainPortfolioTwr link by link), plus total contributed, periodReturns, and the range and hero changes of the Summary chart. Each case has a kind: instrument, portfolio, xirr or period. Units received in kind (funding IN_KIND) are not contributions and stay out of MWR, but are a flow for portfolio TWR. Swap legs are not portfolio flows. A portfolio link is (endValue − flow) / startValue, flow being the gross amounts of trades after its start and up to its end, purchases positive; a link starting at zero or below has a null ratio and is skipped. Value points are ordered by t, and points sharing a t keep the order given; trades by instant, then BUY before SELL, then externalId, then id. The range keeps the points no older than 30, 182 or 365 days of 24 hours before now, or all of them. A rate is stated to six places, rounded half up. Years are 365-day years of 86400000 ms. periodReturns raises 1 + rate to a fractional power: the annual TWR is (1 + twr)^(1 / years) − 1, the cumulative MWR (1 + mwr)^years − 1, both null for null or for a period of zero length, annualized from a full year on. The mobile client's XIRR must be the same algorithm, not an equivalent one: double-precision flows with years counted from the earliest flow; Newton-Raphson from a guess of 0.1, at most 50 steps, stopping when |NPV| ≤ 1e-9 × the largest |amount| or when a step moves the rate by less than 1e-10 (then accepted only if |NPV| at the new rate is within that tolerance), giving up on a non-finite value, a zero slope or a rate at or below −0.999999 or above 1e6; then bisection between −0.999999 and an upper bound that starts at 0.1 and doubles until the NPV changes sign (giving up at 1e6), at most 200 halvings, stopping on the same NPV tolerance or a bracket narrower than 1e-10. Null for fewer than two flows or flows that do not include both signs. The generator refuses any case whose unrounded rate or fractional power lies within 1e-9 of a six-place rounding boundary, so two correct pow implementations agree on every figure here. Shared with the mobile client: both implementations must reproduce every case. Events are LedgerEvents; an absent fxSource is IDENTITY and an absent funding is CASH. expect is written by running the TypeScript core; byHand.figures, where a case has it, are worked out by hand, its arithmetic says how, and each key is a dotted path into expect.",
    cases.map(({ byHand, ...input }) => ({
      ...input,
      ...(byHand ? { byHand } : {}),
      expect: evaluate(input),
    })),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(RETURNS_CONTRACT_FILE, returnsContractJson());
}
