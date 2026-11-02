import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { instrumentSchema, type InstrumentType } from "../../app/core/domain";
import {
  carryforwardFrom,
  computeTaxHistory,
  jurisdictionOf,
  taxYearOf,
} from "../../app/core/tax";
import { buildTaxYearView, taxOptionsFor } from "../../app/lib/tax";

import { contractJson, eventsOf, ledger, type Row } from "./build";

export interface TaxInput {
  name: string;
  residence: "bizkaia";
  instruments: { id: string; type: InstrumentType }[];
  events: Row[];
  years: number[];
}

const FUND = "IE00TEST0101";
const STOCK = "US00TEST0102";
const OTHER = "US00TEST0103";
const THIRD = "US00TEST0104";
const COIN = "TESTCOIN";
const TOKEN = "TESTTOKEN";

const { trade, dividend } = ledger();

const cases: (TaxInput & {
  byHand?: { arithmetic: string; figures: Record<string, string | null> };
})[] = [
  {
    name: "FIFO over two lots with fees on every trade, a partial sale, in a year with a scale",
    residence: "bizkaia",
    instruments: [{ id: FUND, type: "ETF" }],
    events: [
      trade("BUY", FUND, "2026-01-12T09:00:00.000Z", "10", "1000", {
        fees: "1",
      }),
      trade("BUY", FUND, "2026-03-10T09:00:00.000Z", "10", "1200", {
        fees: "2",
      }),
      trade("SELL", FUND, "2026-06-10T09:00:00.000Z", "15", "1650", {
        fees: "3",
      }),
    ],
    years: [2026],
    byHand: {
      arithmetic:
        "Lot one: 10 for 1000 + 1 = 1001, 100.1 each. Lot two: 10 for 1200 + 2 = 1202, 120.2 each. Selling 15 takes all of lot one (1001) and 5 of lot two (5 × 120.2 = 601): cost 1602. Proceeds 1650 − 3 = 1647, gain 45. A gain carrying nothing is not assessed, so all 45 computes. 2026 has a scale: 45 × 0.19 = 8.55.",
      figures: {
        "history.gains.0.costBasis": "1602",
        "history.gains.0.realizedPnL": "45",
        "years.2026.view.netSavingsBase": "45",
        "years.2026.view.quota": "8.55",
      },
    },
  },
  {
    name: "Art. 43: a loss repurchased before the sale, deferred onto the units still held, integrated the next year by a sale at a gain",
    residence: "bizkaia",
    instruments: [{ id: STOCK, type: "STOCK" }],
    events: [
      trade("BUY", STOCK, "2025-01-10T10:00:00.000Z", "10", "1000"),
      trade("BUY", STOCK, "2025-03-03T10:00:00.000Z", "4", "320"),
      trade("SELL", STOCK, "2025-03-20T10:00:00.000Z", "10", "850"),
      trade("SELL", STOCK, "2026-06-01T10:00:00.000Z", "4", "360"),
    ],
    years: [2025, 2026],
    byHand: {
      arithmetic:
        "The March sale takes the January lot whole: 850 − 1000 = −150. Its window runs from 20 January to 20 May 2025; the 4 bought on 3 March are inside it, earlier, and still held after the sale, so before = 4 and the repurchase is min(4, 4) = 4 of 10: 0.4 of the loss, −60, is not computable and stays on those 4 units; −90 computes in 2025. The 2026 sale of those 4 for 360 gains 360 − 320 = 40; it carries −60, nothing is bought in its window, so the −60 integrates in 2026 as its own line: 40 − 60 = −20 computable. 2025 has no scale; 2026 does, but the base is negative, so the quota is 0.",
      figures: {
        "history.gains.0.realizedPnL": "-150",
        "history.gains.0.nonComputable": "-60",
        "history.gains.0.computablePnL": "-90",
        "years.2025.view.quota": null,
        "years.2026.taxYear.computableNet": "-20",
        "years.2026.view.integratedSum": "-60.00",
        "years.2026.view.quota": "0",
      },
    },
  },
  {
    name: "Art. 43: a loss repurchased after the sale, in proportion, then a chain that moves the deferral on before it integrates in another year",
    residence: "bizkaia",
    instruments: [{ id: OTHER, type: "STOCK" }],
    events: [
      trade("BUY", OTHER, "2025-01-10T10:00:00.000Z", "10", "1000"),
      trade("SELL", OTHER, "2025-04-01T10:00:00.000Z", "10", "800"),
      trade("BUY", OTHER, "2025-04-15T10:00:00.000Z", "5", "375"),
      trade("SELL", OTHER, "2025-05-02T10:00:00.000Z", "5", "350"),
      trade("BUY", OTHER, "2025-06-10T10:00:00.000Z", "5", "360"),
      trade("SELL", OTHER, "2026-02-02T10:00:00.000Z", "5", "400", {
        fees: "1",
      }),
    ],
    years: [2025, 2026],
  },
  {
    name: "Crypto: a loss in 2024 rebought within the year only gets a notice; a loss in 2025 falls under letter i",
    residence: "bizkaia",
    instruments: [{ id: COIN, type: "CRYPTO" }],
    events: [
      trade("BUY", COIN, "2024-03-01T12:00:00.000Z", "1", "1000"),
      trade("SELL", COIN, "2024-11-04T12:00:00.000Z", "1", "800"),
      trade("BUY", COIN, "2024-11-20T12:00:00.000Z", "1", "850"),
      trade("SELL", COIN, "2025-02-03T12:00:00.000Z", "1", "700"),
      trade("BUY", COIN, "2025-02-17T12:00:00.000Z", "1", "720"),
    ],
    years: [2024, 2025],
  },
  {
    name: "A crypto swap valued at the greater side, then the received asset sold at a gain",
    residence: "bizkaia",
    instruments: [
      { id: COIN, type: "CRYPTO" },
      { id: TOKEN, type: "CRYPTO" },
    ],
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
      trade("SELL", TOKEN, "2025-09-01T12:00:00.000Z", "10", "650", {
        fees: "2",
      }),
    ],
    years: [2025],
  },
  {
    name: "Four years of carryforward: a 2021 loss offsets later gains oldest first and is gone by 2026",
    residence: "bizkaia",
    instruments: [
      { id: FUND, type: "ETF" },
      { id: STOCK, type: "STOCK" },
      { id: OTHER, type: "STOCK" },
      { id: THIRD, type: "STOCK" },
    ],
    events: [
      trade("BUY", FUND, "2021-01-11T09:00:00.000Z", "10", "1000"),
      trade("SELL", FUND, "2021-06-01T09:00:00.000Z", "10", "500"),
      trade("BUY", STOCK, "2022-01-10T09:00:00.000Z", "10", "1000"),
      trade("SELL", STOCK, "2022-06-01T09:00:00.000Z", "10", "1100"),
      trade("BUY", OTHER, "2025-01-10T09:00:00.000Z", "10", "1000"),
      trade("SELL", OTHER, "2025-06-02T09:00:00.000Z", "10", "1300"),
      trade("BUY", THIRD, "2026-01-12T09:00:00.000Z", "10", "1000"),
      trade("SELL", THIRD, "2026-06-01T09:00:00.000Z", "10", "1200"),
    ],
    years: [2025, 2026],
    byHand: {
      arithmetic:
        "Own nets: 2021 −500, 2022 +100, 2025 +300, 2026 +200. For 2025 the window is 2021–2025: 2022 takes 100 of the 2021 loss (400 left), 2025 takes 300 (100 left), so the base is 0. For 2026 the window is 2022–2026 and the 2021 loss is outside it: the 100 left expired, the base is 200 and the quota 200 × 0.19 = 38.",
      figures: {
        "years.2025.carryforward.netSavingsBase": "0",
        "years.2025.carryforward.steps.4.pendingLossRemaining": "100",
        "years.2026.carryforward.netSavingsBase": "200",
        "years.2026.view.quota": "38",
      },
    },
  },
  {
    name: "A sale and in-kind income at 23:30Z on 31 December belong to the next fiscal year in Madrid",
    residence: "bizkaia",
    instruments: [{ id: FUND, type: "ETF" }],
    events: [
      trade("BUY", FUND, "2025-06-02T09:00:00.000Z", "10", "1000"),
      trade("SELL", FUND, "2025-12-31T23:30:00.000Z", "10", "1200"),
      dividend(FUND, "2025-12-31T23:30:00.000Z", "5", "0.95", {
        funding: "IN_KIND",
      }),
    ],
    years: [2025, 2026],
  },
];

/** `buildTaxYearView` reads `today` only for the open-window date of each sale row, which the contract leaves out. */
const TODAY = "2026-12-31";

export function evaluate(input: TaxInput) {
  const jurisdiction = jurisdictionOf(input.residence);
  const events = eventsOf(input.events);
  const instruments = input.instruments.map((i) =>
    instrumentSchema.parse({ id: i.id, name: i.id, type: i.type }),
  );
  const options = taxOptionsFor(instruments, jurisdiction);
  const history = computeTaxHistory(events, options);

  return {
    assetClasses: Object.fromEntries(options.assetClasses),
    history: {
      gains: history.gains,
      integrations: history.integrations,
      pendingByYear: Object.fromEntries(history.pendingByYear),
    },
    years: Object.fromEntries(
      input.years.map((year) => {
        const view = buildTaxYearView(
          events,
          instruments,
          year,
          jurisdiction,
          TODAY,
        );
        return [
          year,
          {
            taxYear: taxYearOf(history, year),
            carryforward: carryforwardFrom(history, year),
            view: {
              affectedCount: view.affectedCount,
              ownNet: view.ownNet,
              nonComputableSum: view.nonComputableSum,
              integratedSum: view.integratedSum,
              computableNet: view.computableNet,
              pendingSum: view.pendingSum,
              netSavingsBase: view.netSavingsBase,
              scale: view.scale,
              quota: view.quota,
              inKindIncome: view.inKindIncome,
            },
          },
        ];
      }),
    ),
  };
}

export const TAX_CONTRACT_FILE = fileURLToPath(
  new URL("./tax.json", import.meta.url),
);

export function taxContractJson(): string {
  return contractJson(
    "tax",
    "The Bizkaia foral tax view: FIFO, the Art. 43 repurchase rule (letter g for listed securities, letter i for crypto from 2025-01-01, a notice for a crypto loss before), deferred losses and where they integrate, four-year carryforward (Art. 66) and the savings-base quota. Shared with the mobile client: both implementations must reproduce every case. Events are LedgerEvents; an absent fxSource is IDENTITY and an absent funding is CASH. assetClasses comes from each instrument's type (ETF, STOCK listed-security; CRYPTO fungible-crypto; BOND, COMMODITY, CASH unclassified). history is computeTaxHistory over the whole ledger; years holds, per requested year, taxYearOf, carryforwardFrom, and the figures of buildTaxYearView (sums to two places, the scale in force and the quota: null when no scale is on file for that territory and year, never the nearest year's). The repurchase rules, the swap valuation and the scales are tables both sides carry. Fiscal years and repurchase windows are Madrid calendar days. Instants are ISO strings; a calendar day is {year, month, day}. Pending deferrals list oldest acquisition first, then by buy id. expect is written by running the TypeScript core; byHand.figures, where a case has it, are worked out by hand, its arithmetic says how, and each key is a dotted path into expect.",
    cases.map(({ byHand, ...input }) => ({
      ...input,
      ...(byHand ? { byHand } : {}),
      expect: evaluate(input),
    })),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(TAX_CONTRACT_FILE, taxContractJson());
}
