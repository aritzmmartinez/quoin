import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { computeRealizedGains } from "../../app/core/projections";
import { jurisdictionOf } from "../../app/core/tax";

import { contractJson, eventsOf, ledger, type Row } from "./build";

export interface RealizedInput {
  name: string;
  residence: "bizkaia";
  events: Row[];
}

const FUND = "IE00TEST0201";
const STOCK = "US00TEST0202";
const COIN = "TESTCOIN";
const TOKEN = "TESTTOKEN";

const { trade } = ledger();

const cases: (RealizedInput & {
  byHand?: { arithmetic: string; figures: Record<string, string | null> };
})[] = [
  {
    name: "AVCO sales with fees: a partial sale, then the rest, then a rebuy and a sale of part of it",
    residence: "bizkaia",
    events: [
      trade("BUY", FUND, "2025-01-10T09:00:00.000Z", "10", "1000", {
        fees: "1",
      }),
      trade("BUY", FUND, "2025-02-10T09:00:00.000Z", "5", "600", { fees: "1" }),
      trade("SELL", FUND, "2025-03-10T09:00:00.000Z", "6", "720", {
        fees: "1",
      }),
      trade("SELL", FUND, "2025-07-10T08:00:00.000Z", "9", "990", {
        fees: "1.5",
      }),
      trade("BUY", FUND, "2025-09-01T09:00:00.000Z", "3", "300"),
      trade("SELL", FUND, "2025-12-31T23:30:00.000Z", "1", "110"),
    ],
    byHand: {
      arithmetic:
        "15 units cost 1000 + 1 + 600 + 1 = 1602, 106.8 each. Selling 6 for 720 − 1 takes 640.8: realised 78.2, return 78.2 / 640.8 = 0.122035 (to six places). The 9 left cost 961.2; selling them all for 990 − 1.5 = 988.5 realises 27.3 and empties the position. A rebuy of 3 for 300 starts again at 100 each; selling 1 for 110 realises 10.",
      figures: {
        "0.costBasis": "640.8",
        "0.realizedPnL": "78.2",
        "0.returnPct": "0.122035",
        "1.costBasis": "961.2",
        "1.realizedPnL": "27.3",
        "2.costBasis": "100",
        "2.realizedPnL": "10",
      },
    },
  },
  {
    name: "A crypto swap, both legs valued at the greater side, and the received asset sold",
    residence: "bizkaia",
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
      trade("SELL", TOKEN, "2025-06-01T12:00:00.000Z", "4", "260"),
    ],
    byHand: {
      arithmetic:
        "The swap delivers 0.5 coin worth 600 and receives 10 tokens worth 580 + 25 fee = 605; the greater, 605, less the 25 fee is both the sale's proceeds and the tokens' cost: 580. Half a coin costs 500, so the swap realises 80. Four of the ten tokens cost 4 × 58 = 232; sold for 260 they realise 28.",
      figures: {
        "0.realizedPnL": "80",
        "1.costBasis": "232",
        "1.realizedPnL": "28",
      },
    },
  },
  {
    name: "Units received in kind enter the average at their value and are sold with the rest; a sale converted from USD",
    residence: "bizkaia",
    events: [
      trade("BUY", FUND, "2025-04-01T09:00:00.000Z", "10", "1000"),
      trade("BUY", FUND, "2025-04-15T09:00:00.000Z", "0.5", "51", {
        funding: "IN_KIND",
      }),
      trade("SELL", FUND, "2025-10-01T09:00:00.000Z", "10.5", "1155", {
        fees: "1",
      }),
      trade("BUY", STOCK, "2025-05-02T15:00:00.000Z", "2", "217", {
        fees: "1.085",
        currency: "USD",
        fxSource: "ECB",
        fxRate: "1.085",
        fxDirection: "QUOTE_PER_BASE",
        fxDate: "2025-05-02",
      }),
      trade("SELL", STOCK, "2025-11-03T15:00:00.000Z", "1", "115.5", {
        currency: "USD",
        fxSource: "ECB",
        fxRate: "1.155",
        fxDirection: "QUOTE_PER_BASE",
        fxDate: "2025-11-03",
      }),
    ],
  },
];

export function evaluate(input: RealizedInput) {
  return computeRealizedGains(
    eventsOf(input.events),
    jurisdictionOf(input.residence),
  );
}

export const REALIZED_CONTRACT_FILE = fileURLToPath(
  new URL("./realized.json", import.meta.url),
);

export function realizedContractJson(): string {
  return contractJson(
    "realized",
    "Realised gains on the portfolio's AVCO basis (not the FIFO of the tax view): one row per sale, in trade order (instant, then BUY before SELL, then externalId, then id), amounts in euros with fees inside both the cost and the proceeds. A swap is valued at the greater of its two legs, less its fee. Units received in kind (funding IN_KIND) enter the average at their value. price is gross over quantity; returnPct is realised over cost to six places, null on a zero cost; holdingDays is the sale instant minus the quantity-weighted acquisition instant of what was held, in days rounded half up, null when nothing was held. Shared with the mobile client: both implementations must reproduce every case. Events are LedgerEvents; an absent fxSource is IDENTITY and an absent funding is CASH. expect is written by running the TypeScript core; byHand.figures, where a case has it, are worked out by hand, its arithmetic says how, and each key is a dotted path into expect.",
    cases.map(({ byHand, ...input }) => ({
      ...input,
      ...(byHand ? { byHand } : {}),
      expect: evaluate(input),
    })),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(REALIZED_CONTRACT_FILE, realizedContractJson());
}
