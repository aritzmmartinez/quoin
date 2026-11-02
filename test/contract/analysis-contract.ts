import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import Decimal from "decimal.js";

import { dayOf } from "../../app/core/calendar";
import {
  compareTrades,
  isInKind,
  isSwapLeg,
  type TradeEvent,
} from "../../app/core/domain";
import {
  baseOf,
  bookable,
  historyInBase,
  pricesInBase,
  rateBookFrom,
} from "../../app/core/fx";
import type { FxRate } from "../../app/core/ports";
import {
  computeOpportunityCost,
  computeRebalance,
  computeWeightedTer,
  xirr,
  type CashFlow,
  type OpportunityCostResult,
  type RebalanceInput,
  type TerLine,
} from "../../app/core/projections";
import { onOrBeforeDay } from "../../app/core/series";
import { jurisdictionOf } from "../../app/core/tax";

import {
  assertClearOfRounding,
  contractJson,
  eventsOf,
  ledger,
  type Row,
} from "./build";

interface Quote {
  instrumentId: string;
  price: string;
  currency: string;
  asOf: string;
}

interface OpportunityCase {
  kind: "opportunity";
  residence: "bizkaia";
  now: string;
  events: Row[];
  benchmarkInstrumentId: string;
  benchmarkHistory: Quote[];
  prices: Quote[];
  rates: FxRate[];
}

interface TerCase {
  kind: "ter";
  lines: TerLine[];
}

interface RebalanceCase extends RebalanceInput {
  kind: "rebalance";
}

export type AnalysisInput = { name: string } & (
  | OpportunityCase
  | TerCase
  | RebalanceCase
);

const BENCH = "IE00TEST0500";
const FUND = "IE00TEST0501";
const STOCK = "US00TEST0502";
const BOND = "IE00TEST0503";
const UNPRICED = "IE00TEST0504";

const { trade } = ledger();

const close = (price: string, asOf: string, currency = "EUR"): Quote => ({
  instrumentId: BENCH,
  price,
  currency,
  asOf,
});
const quote = (instrumentId: string, price: string): Quote => ({
  instrumentId,
  price,
  currency: "EUR",
  asOf: "2025-08-01T15:30:00.000Z",
});

const HISTORY = [
  close("100", "2025-01-15T16:30:00.000Z"),
  close("110", "2025-01-16T16:30:00.000Z"),
  close("125", "2025-03-17T16:30:00.000Z"),
  close("140", "2025-06-02T15:30:00.000Z"),
  close("150", "2025-08-01T15:30:00.000Z"),
];

const cases: (AnalysisInput & {
  byHand?: { arithmetic: string; figures: Record<string, string | null> };
})[] = [
  {
    name: "Opportunity cost against a benchmark: a sale, units received in kind, a purchase before the first close, one in a gap of closes and an open position with no price",
    kind: "opportunity",
    residence: "bizkaia",
    now: "2025-08-01T17:00:00.000Z",
    events: [
      trade("BUY", FUND, "2025-01-15T09:00:00.000Z", "10", "1000", {
        fees: "1",
      }),
      trade("BUY", FUND, "2025-03-17T09:00:00.000Z", "5", "600"),
      trade("BUY", FUND, "2025-04-01T09:00:00.000Z", "0.5", "60", {
        funding: "IN_KIND",
      }),
      trade("SELL", FUND, "2025-06-02T09:00:00.000Z", "3", "390", {
        fees: "1",
      }),
      trade("BUY", STOCK, "2025-01-02T15:00:00.000Z", "2", "200"),
      trade("BUY", BOND, "2025-05-01T09:00:00.000Z", "1", "100"),
      trade("BUY", UNPRICED, "2025-02-03T09:00:00.000Z", "3", "300"),
    ],
    benchmarkInstrumentId: BENCH,
    benchmarkHistory: HISTORY,
    prices: [quote(FUND, "130"), quote(STOCK, "105"), quote(BOND, "98")],
    rates: [],
    byHand: {
      arithmetic:
        "Fund: 1001 + 600 contributed; the in-kind half unit is not. Its gross 1000 buys 10 benchmark units at 100 on 15 January and 600 buys 4.8 at 125 on 17 March: 14.8 × 150 = 2220. Held 10 + 5 + 0.5 − 3 = 12.5 at 130 is 1625, plus 390 − 1 = 389 from the sale: 2014, so −206 against the benchmark. The stock was bought on 2 January, before the first close (truncated: 200); the bond on 1 May, 45 days after the last close before it, and the unpriced position on 3 February, 18 days after one: gaps of 100 + 300 = 400. The stock and the bond stay in the real value at nothing in the benchmark, so they lead the lines: 210, then 98. The unpriced position is left out and named.",
      figures: {
        "result.lines.0.instrumentId": STOCK,
        "result.lines.2.difference": "-206",
        "result.realizedProceeds": "389",
        "result.truncated.amount": "200",
        "result.gaps.amount": "400",
        "result.unpricedInstrumentIds.0": UNPRICED,
      },
    },
  },
  {
    name: "Opportunity cost with a benchmark quoted in USD, each close at its own day's rate, and two lines with the same difference ordered by id",
    kind: "opportunity",
    residence: "bizkaia",
    now: "2025-03-31T17:00:00.000Z",
    events: [
      trade("BUY", STOCK, "2025-03-03T15:00:00.000Z", "1", "100"),
      trade("BUY", FUND, "2025-03-03T16:00:00.000Z", "1", "100"),
    ],
    benchmarkInstrumentId: BENCH,
    benchmarkHistory: [
      close("110", "2025-03-03T21:00:00.000Z", "USD"),
      close("132", "2025-03-31T20:00:00.000Z", "USD"),
    ],
    prices: [quote(FUND, "120"), quote(STOCK, "120")],
    rates: [
      { base: "EUR", quote: "USD", day: "2025-03-03", rate: "1.1", source: "ECB" },
      { base: "EUR", quote: "USD", day: "2025-03-31", rate: "1.1", source: "ECB" },
    ],
  },
  {
    name: "Weighted TER by market value, an instrument with no TER excluded and named, and one with nothing held skipped",
    kind: "ter",
    lines: [
      { instrumentId: FUND, value: "6000", ter: "0.0022" },
      { instrumentId: STOCK, value: "3000", ter: "0.0012" },
      { instrumentId: BOND, value: "1000", ter: null },
      { instrumentId: UNPRICED, value: "0", ter: "0.002" },
    ],
    byHand: {
      arithmetic:
        "Covered: 6000 + 3000 = 9000 of 10000, coverage 0.9. Fees a year: 6000 × 0.0022 + 3000 × 0.0012 = 13.2 + 3.6 = 16.8; over 9000 that is 0.0018666…, 0.001867 to six places. The bond has no TER and is named, not counted as free.",
      figures: {
        weightedTer: "0.001867",
        annualCost: "16.8",
        coverage: "0.900000",
        "unknownInstrumentIds.0": BOND,
      },
    },
  },
  {
    name: "A rebalance whose contribution falls short of the deficits: split by deficit, and the line over its weight gets nothing",
    kind: "rebalance",
    contribution: "500",
    lines: [
      { instrumentId: FUND, currentValue: "5800", targetWeight: "0.6" },
      { instrumentId: STOCK, currentValue: "3200", targetWeight: "0.3" },
      { instrumentId: BOND, currentValue: "1000", targetWeight: "0.1" },
    ],
    byHand: {
      arithmetic:
        "10000 held plus 500 is 10500. Ideal: 6300, 3150, 1050; deficits 500, none (the stock is 50 over) and 50, 550 in all. The 500 goes 500/550 and 50/550: 454.5454… and 45.4545…, 454.55 and 45.45 to the cent, which add up to 500. Drift before: the fund holds 0.58 against 0.6, the stock 0.32 against 0.3, so 0.02 each.",
      figures: {
        "allocations.0.amount": "454.55",
        "allocations.1.amount": "0",
        "allocations.2.amount": "45.45",
        "allocations.0.driftBefore": "0.020000",
        "allocations.1.driftBefore": "0.020000",
      },
    },
  },
  {
    name: "A rebalance whose split does not round to the cent: weights that do not add up to one, and the cent left over goes to the first of the largest",
    kind: "rebalance",
    contribution: "100",
    lines: [
      { instrumentId: FUND, currentValue: "0", targetWeight: "1" },
      { instrumentId: STOCK, currentValue: "0", targetWeight: "1" },
      { instrumentId: BOND, currentValue: "0", targetWeight: "1" },
    ],
  },
];

/** Solves the flows the description states and refuses a case whose rate sits on a rounding boundary or disagrees with the core's. */
function guardMwr(
  input: OpportunityCase & { name: string },
  result: OpportunityCostResult,
  closes: { day: string; price: string }[],
): void {
  const zone = jurisdictionOf(input.residence).zone;
  const now = new Date(input.now).getTime();
  const lined = new Set(result.lines.map((l) => l.instrumentId));
  const real: CashFlow[] = [];
  const bench: CashFlow[] = [];
  for (const t of bookable(eventsOf(input.events))
    .filter((e): e is TradeEvent => e.type === "BUY" || e.type === "SELL")
    .sort(compareTrades)) {
    if (!lined.has(t.instrumentId) || isSwapLeg(t)) continue;
    const gross = baseOf(t, "grossAmount");
    const fees = baseOf(t, "fees");
    if (t.type === "SELL") {
      real.push({ t: t.ts.getTime(), amount: gross.subtract(fees).toNumber() });
      continue;
    }
    if (isInKind(t)) continue;
    const flow = { t: t.ts.getTime(), amount: -gross.add(fees).toNumber() };
    real.push(flow);
    const price = onOrBeforeDay(closes, (c) => c.day, dayOf(t.ts, zone), 7);
    if (price && !new Decimal(price.price).isZero()) bench.push(flow);
  }
  for (const [flows, terminal, stated, label] of [
    [real, result.realValue, result.realMwr, "realMwr"],
    [bench, result.benchmarkValue, result.benchmarkMwr, "benchmarkMwr"],
  ] as const) {
    const all = new Decimal(terminal).isZero()
      ? [...flows]
      : [...flows, { t: now, amount: new Decimal(terminal).toNumber() }];
    const rate = xirr(all);
    assertClearOfRounding(rate, `${input.name} ${label}`);
    const rounded = rate === null ? null : new Decimal(rate).toFixed(6);
    if (rounded !== stated) {
      throw new Error(`${label}: flows give ${rounded}, the core ${stated}`);
    }
  }
}

export function evaluate(input: AnalysisInput) {
  switch (input.kind) {
    case "opportunity": {
      const { zone } = jurisdictionOf(input.residence);
      const book = rateBookFrom(input.rates);
      const now = new Date(input.now);
      const benchmark = historyInBase(
        input.benchmarkHistory.map((q) => ({
          ...q,
          asOf: new Date(q.asOf),
          source: "TEST",
        })),
        book,
        zone,
      );
      const { prices } = pricesInBase(
        new Map(input.prices.map((p) => [p.instrumentId, p])),
        book,
        now,
        zone,
      );
      const result = computeOpportunityCost({
        events: eventsOf(input.events),
        benchmarkInstrumentId: input.benchmarkInstrumentId,
        benchmarkHistory: benchmark.history,
        prices,
        now,
        zone,
      });
      const byDay = new Map<string, string>();
      for (const s of benchmark.history) byDay.set(dayOf(s.asOf, zone), s.price);
      guardMwr(
        input,
        result,
        [...byDay].map(([day, price]) => ({ day, price })).sort((a, b) =>
          a.day < b.day ? -1 : 1,
        ),
      );
      return { benchmarkInBase: benchmark, result };
    }
    case "ter":
      return computeWeightedTer(input.lines);
    case "rebalance":
      return computeRebalance(input);
  }
}

export const ANALYSIS_CONTRACT_FILE = fileURLToPath(
  new URL("./analysis.json", import.meta.url),
);

export function analysisContractJson(): string {
  return contractJson(
    "analysis",
    "The analysis screens, by kind. opportunity: computeOpportunityCost — what each euro contributed would be worth had it bought the benchmark on the same Madrid day, at the benchmark's close of that day or the last one within 7 days before it (the latest close of a day wins), after bringing the benchmark's closes to euros at the rate of their own day and today's prices at today's. A purchase with no close is set aside as truncated (before the first close), stale (after the last) or gaps, by its cost. Units received in kind and swap legs are not contributions; sales add their net proceeds to the real value. An open position with no price is left out and named. Lines are ordered by difference, largest first, then by instrument id. realMwr and benchmarkMwr are XIRRs as in returns.json (the same algorithm, to six places), each over its own flows plus its value at now. ter: computeWeightedTer — value-weighted annual fee over the lines that have one, to six places; annualCost is the weighted sum to the cent; a line with no TER is excluded and named, a line worth nothing is skipped. rebalance: computeRebalance — weights are normalised to sum to one; each line's deficit is its weight of (held + contribution) less what it holds, floored at zero; the contribution is split by deficit, rounded half up to the cent, and the cent left over goes to the largest amount (the first of equals); drift is |share − weight| to six places. Shared with the mobile client: both implementations must reproduce every case. Events are LedgerEvents; an absent fxSource is IDENTITY and an absent funding is CASH. expect is written by running the TypeScript core; byHand.figures, where a case has it, are worked out by hand, its arithmetic says how, and each key is a dotted path into expect.",
    cases.map(({ byHand, ...input }) => ({
      ...input,
      ...(byHand ? { byHand } : {}),
      expect: evaluate(input),
    })),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(ANALYSIS_CONTRACT_FILE, analysisContractJson());
}
