import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import Decimal from "decimal.js";

import { ledgerEventSchema, type LedgerEvent } from "../../app/core/domain";
import {
  pricesInBase,
  rateBookFrom,
  unconvertibleInstrumentIds,
} from "../../app/core/fx";
import type { FxRate } from "../../app/core/ports";
import {
  computeAllocation,
  computeMarketValues,
  computePortfolioSummary,
  computePositions,
  computeTopPositions,
} from "../../app/core/projections";
import { jurisdictionOf } from "../../app/core/tax";

type Row = Record<string, unknown>;

export interface PortfolioPrice {
  instrumentId: string;
  price: string;
  currency: string;
  asOf: string;
}

export interface PortfolioInput {
  name: string;
  residence: "bizkaia";
  now: string;
  events: Row[];
  prices: PortfolioPrice[];
  rates: FxRate[];
  categories: Record<string, string>;
  topLimit: number;
}

export interface ByHand {
  arithmetic: string;
  positions: Record<string, { quantity: string; costBasis: string }>;
  totalValue: string;
  unrealizedPnL: string;
  openCost?: string;
  realizedPnL?: string;
}

const FUND = "IE00TEST0001";
const STOCK = "US00TEST0002";
const USD_STOCK = "US00TEST0003";
const UNRATED_ROW = "US00TEST0004";
const GBP_LINE = "GB00TEST0005";
const BOND_FUND = "IE00TEST0006";
const GOLD = "XS00TEST0007";
const CLOSED = "IE00TEST0008";
const COIN = "TESTCOIN";
const TOKEN = "TESTTOKEN";

let seq = 0;
function trade(
  type: "BUY" | "SELL",
  instrumentId: string,
  ts: string,
  quantity: string,
  grossAmount: string,
  extra: Row = {},
): Row {
  seq += 1;
  return {
    id: `e-${seq}`,
    ts,
    type,
    instrumentId,
    quantity,
    price: new Decimal(grossAmount).div(quantity).toFixed(),
    grossAmount,
    fees: "0",
    currency: "EUR",
    account: "test",
    source: "TEST",
    externalId: `x-${seq}`,
    ...extra,
  };
}

const usd = (fxDate: string, fxRate = "1.085"): Row => ({
  currency: "USD",
  fxSource: "ECB",
  fxRate,
  fxDirection: "QUOTE_PER_BASE",
  fxDate,
});

const price = (
  instrumentId: string,
  value: string,
  asOf: string,
  currency = "EUR",
): PortfolioPrice => ({ instrumentId, price: value, currency, asOf });

const rate = (quote: string, day: string, value: string): FxRate => ({
  base: "EUR",
  quote,
  day,
  rate: value,
  source: "ECB",
});

const cases: (PortfolioInput & { byHand?: ByHand })[] = [
  {
    name: "Fees on every trade and a partial sale, two instruments",
    residence: "bizkaia",
    now: "2025-12-31T23:30:00.000Z",
    events: [
      trade("BUY", FUND, "2025-01-10T09:00:00.000Z", "10", "1000", {
        fees: "1",
      }),
      trade("BUY", FUND, "2025-02-10T09:00:00.000Z", "5", "600", { fees: "1" }),
      trade("SELL", FUND, "2025-03-10T09:00:00.000Z", "6", "720", {
        fees: "1",
      }),
      trade("BUY", STOCK, "2025-04-10T09:00:00.000Z", "4", "400", {
        fees: "2",
      }),
    ],
    prices: [
      price(FUND, "110", "2025-12-31T16:30:00.000Z"),
      price(STOCK, "95", "2025-12-31T21:00:00.000Z"),
    ],
    rates: [],
    categories: { [FUND]: "EQUITY_FUND", [STOCK]: "COMPANY" },
    topLimit: 5,
    byHand: {
      arithmetic:
        "Fund: 10 for 1000 + 1 and 5 for 600 + 1 is 15 units costing 1602, 106.8 each. Selling 6 takes 6 × 106.8 = 640.8 out: 9 units costing 961.2, and 720 − 1 − 640.8 = 78.2 realised. Stock: 4 for 400 + 2 = 402. Value 9 × 110 + 4 × 95 = 990 + 380 = 1370; cost 961.2 + 402 = 1363.2; unrealised 1370 − 1363.2 = 6.8.",
      positions: {
        [FUND]: { quantity: "9", costBasis: "961.2" },
        [STOCK]: { quantity: "4", costBasis: "402" },
      },
      totalValue: "1370",
      unrealizedPnL: "6.8",
      realizedPnL: "78.2",
    },
  },
  {
    name: "A full sale and a rebuy, then a sale and a purchase at the same instant, the sale listed first",
    residence: "bizkaia",
    now: "2026-01-15T12:00:00.000Z",
    events: [
      trade("BUY", STOCK, "2025-01-15T10:00:00.000Z", "10", "1000"),
      trade("SELL", STOCK, "2025-04-01T10:00:00.000Z", "10", "1200", {
        fees: "2",
      }),
      trade("BUY", STOCK, "2025-10-26T00:30:00.000Z", "5", "550", {
        fees: "1",
      }),
      trade("SELL", STOCK, "2025-12-31T23:30:00.000Z", "2", "240"),
      trade("BUY", STOCK, "2025-12-31T23:30:00.000Z", "3", "330"),
    ],
    prices: [price(STOCK, "120", "2026-01-14T21:00:00.000Z")],
    rates: [],
    categories: { [STOCK]: "COMPANY" },
    topLimit: 5,
    byHand: {
      arithmetic:
        "10 for 1000, then all 10 sold for 1200 − 2: 1198 − 1000 = 198 realised and the position is empty, cost 0. Rebuy 5 for 550 + 1 = 551. At one instant the purchase goes first whatever the order listed: 8 units costing 881, 110.125 each; selling 2 takes 220.25 out, 240 − 220.25 = 19.75 realised, leaving 6 units costing 660.75. Value 6 × 120 = 720; unrealised 720 − 660.75 = 59.25; realised 198 + 19.75 = 217.75. With the sale first it would have been 6 units costing 661.2.",
      positions: { [STOCK]: { quantity: "6", costBasis: "660.75" } },
      totalValue: "720",
      unrealizedPnL: "59.25",
      realizedPnL: "217.75",
    },
  },
  {
    name: "An in-kind purchase, a row converted at the ECB rate and an instrument with a row that has none; valued just after midnight in Madrid",
    residence: "bizkaia",
    now: "2025-10-23T22:30:00.000Z",
    events: [
      trade("BUY", FUND, "2025-06-02T08:00:00.000Z", "10", "1000"),
      trade("BUY", FUND, "2025-06-03T08:00:00.000Z", "0.5", "52", {
        funding: "IN_KIND",
      }),
      trade("BUY", USD_STOCK, "2025-06-02T15:00:00.000Z", "10", "1085", {
        fees: "1.085",
        ...usd("2025-06-02"),
      }),
      trade(
        "BUY",
        UNRATED_ROW,
        "2025-06-02T15:00:00.000Z",
        "2",
        "217",
        usd("2025-06-02"),
      ),
      trade("BUY", UNRATED_ROW, "2025-06-04T15:00:00.000Z", "3", "300", {
        currency: "USD",
      }),
    ],
    prices: [
      price(FUND, "100", "2025-10-23T15:30:00.000Z"),
      price(USD_STOCK, "120", "2025-10-23T20:00:00.000Z", "USD"),
      price(UNRATED_ROW, "50", "2025-10-23T20:00:00.000Z", "USD"),
    ],
    rates: [rate("USD", "2025-10-23", "1.1"), rate("USD", "2025-10-24", "1.2")],
    categories: { [FUND]: "EQUITY_FUND", [USD_STOCK]: "COMPANY" },
    topLimit: 5,
    byHand: {
      arithmetic:
        "Fund: 10 for 1000 plus 0.5 received in kind at 52 is 10.5 units costing 1052. USD stock: 1085 USD and 1.085 USD of fees at 1.085 USD per euro are 1000 + 1 = 1001. The other USD instrument has one row in USD with no rate, so every row of it is left out. 22:30Z on 23 October is 00:30 on the 24th in Madrid, so its rate 1.2 applies, not the 23rd's 1.1: 120 USD is 100 €. Value 10.5 × 100 + 10 × 100 = 2050; cost 1052 + 1001 = 2053; unrealised −3.",
      positions: {
        [FUND]: { quantity: "10.5", costBasis: "1052" },
        [USD_STOCK]: { quantity: "10", costBasis: "1001" },
      },
      totalValue: "2050",
      unrealizedPnL: "-3",
    },
  },
  {
    name: "A crypto swap valued at the greater side, and a line quoted in a currency with no rate",
    residence: "bizkaia",
    now: "2025-04-02T10:00:00.000Z",
    events: [
      trade("BUY", COIN, "2025-03-01T12:00:00.000Z", "1", "1000"),
      trade("BUY", TOKEN, "2025-03-31T22:30:00.000Z", "10", "580", {
        fees: "25",
        linkId: "swap-1",
        linkKind: "swap",
      }),
      trade("SELL", COIN, "2025-03-31T22:30:00.000Z", "0.5", "600", {
        linkId: "swap-1",
        linkKind: "swap",
      }),
      trade("BUY", GBP_LINE, "2025-03-15T10:00:00.000Z", "2", "200"),
    ],
    prices: [
      price(COIN, "1100", "2025-04-02T09:59:00.000Z"),
      price(TOKEN, "50", "2025-04-02T09:59:00.000Z"),
      price(GBP_LINE, "90", "2025-04-01T15:30:00.000Z", "GBP"),
    ],
    rates: [],
    categories: { [COIN]: "CRYPTO", [TOKEN]: "CRYPTO" },
    topLimit: 5,
    byHand: {
      arithmetic:
        "Swap: 0.5 coin delivered worth 600; 10 tokens received worth 580 + a 25 fee = 605. The greater, 605, is the transmission value; the fee comes off it, so the sale's proceeds and the tokens' cost are both 605 − 25 = 580. Coin: 1 for 1000, half sold takes 500 out, leaving 0.5 costing 500. Tokens: 10 costing 580. The GBP line has no rate and stays unvalued at its cost of 200. Value 0.5 × 1100 + 10 × 50 = 550 + 500 = 1050; priced cost 500 + 580 = 1080; unrealised −30; cost of everything held 1080 + 200 = 1280.",
      positions: {
        [COIN]: { quantity: "0.5", costBasis: "500" },
        [TOKEN]: { quantity: "10", costBasis: "580" },
        [GBP_LINE]: { quantity: "2", costBasis: "200" },
      },
      totalValue: "1050",
      unrealizedPnL: "-30",
      openCost: "1280",
    },
  },
  {
    name: "Several instruments, a closed position, an uncategorised one and a top list cut short, valued on the night the clocks go forward",
    residence: "bizkaia",
    now: "2026-03-29T01:30:00.000Z",
    events: [
      trade("BUY", FUND, "2025-11-03T09:00:00.000Z", "12.345678", "1234.57", {
        fees: "0.99",
      }),
      trade("BUY", FUND, "2026-01-05T09:00:00.000Z", "4.2", "450", {
        fees: "0.99",
      }),
      trade("BUY", BOND_FUND, "2025-11-03T09:00:00.000Z", "30", "1500", {
        fees: "1.5",
      }),
      trade("SELL", BOND_FUND, "2026-02-02T09:00:00.000Z", "7.5", "380", {
        fees: "1.5",
      }),
      trade("BUY", STOCK, "2025-12-01T15:30:00.000Z", "3", "651", {
        fees: "1.085",
        ...usd("2025-12-01"),
      }),
      trade("BUY", GOLD, "2026-03-28T23:30:00.000Z", "1", "250"),
      trade("BUY", CLOSED, "2025-11-03T09:00:00.000Z", "5", "500", {
        fees: "1",
      }),
      trade("SELL", CLOSED, "2026-03-01T09:00:00.000Z", "5", "480", {
        fees: "1",
      }),
    ],
    prices: [
      price(FUND, "104.37", "2026-03-27T16:30:00.000Z"),
      price(BOND_FUND, "50.12", "2026-03-27T16:30:00.000Z"),
      price(STOCK, "231.4", "2026-03-27T20:00:00.000Z", "USD"),
      price(GOLD, "251.3", "2026-03-27T16:30:00.000Z"),
      price(CLOSED, "97", "2026-03-27T16:30:00.000Z"),
    ],
    rates: [
      rate("USD", "2026-03-26", "1.0821"),
      rate("USD", "2026-03-27", "1.0794"),
    ],
    categories: {
      [FUND]: "EQUITY_FUND",
      [BOND_FUND]: "BOND_FUND",
      [STOCK]: "COMPANY",
      [CLOSED]: "EQUITY_FUND",
    },
    topLimit: 2,
  },
];

export function eventsOf(rows: readonly Row[]): LedgerEvent[] {
  return rows.map((row) =>
    ledgerEventSchema.parse({ ...row, ts: new Date(String(row.ts)) }),
  );
}

export function evaluate(input: PortfolioInput) {
  const jurisdiction = jurisdictionOf(input.residence);
  const events = eventsOf(input.events);
  const positions = computePositions(events, jurisdiction);
  const { prices, unrated } = pricesInBase(
    new Map(input.prices.map((p) => [p.instrumentId, p])),
    rateBookFrom(input.rates),
    new Date(input.now),
    jurisdiction.zone,
  );
  const marketValues = computeMarketValues(positions, prices, "EUR");
  const categories = new Map(Object.entries(input.categories));
  return {
    unconvertible: unconvertibleInstrumentIds(events),
    positions,
    pricesInBase: {
      prices: Object.fromEntries(prices),
      unrated: Object.fromEntries(unrated),
    },
    marketValues: Object.fromEntries(marketValues),
    summary: computePortfolioSummary(positions, marketValues),
    allocation: computeAllocation(positions, marketValues, categories),
    top: computeTopPositions(positions, marketValues, input.topLimit),
  };
}

export const PORTFOLIO_CONTRACT_FILE = fileURLToPath(
  new URL("./portfolio.json", import.meta.url),
);

export function portfolioContractJson(): string {
  return `${JSON.stringify(
    {
      contract: "portfolio",
      version: 1,
      description:
        "What the home screen shows: AVCO positions, prices in euros, market values, the summary, the allocation by category and the top positions. Shared with the mobile client: both implementations must reproduce every case. Events are LedgerEvents; an absent fxSource is IDENTITY and an absent funding is CASH. Positions come in the order of each instrument's first trade, trades ordered by instant, then BUY before SELL, then externalId, then id; pricesInBase, marketValues, summary, allocation and top come from those positions, and an instrument with no category falls into OTHER. expect is written by running the TypeScript core; byHand, where a case has it, is worked out by hand and its arithmetic says how.",
      cases: cases.map(({ byHand, ...input }) => ({
        ...input,
        ...(byHand ? { byHand } : {}),
        expect: evaluate(input),
      })),
    },
    null,
    2,
  )}
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(PORTFOLIO_CONTRACT_FILE, portfolioContractJson());
}
