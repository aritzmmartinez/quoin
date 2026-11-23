import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  instrumentSchema,
  type InstrumentType,
  type Residence,
} from "../../app/core/domain";
import {
  computeTaxHistory,
  jurisdictionOf,
  taxYearOf,
} from "../../app/core/tax";
import { buildTaxYearView, taxOptionsFor } from "../../app/lib/tax";

import { contractJson, eventsOf, ledger, type Row } from "./build";

export interface TaxInput {
  name: string;
  residence: Residence;
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

const interest = (
  n: number,
  ts: string,
  grossAmount: string,
  taxWithheld: string,
  source = "TEST",
): Row => ({
  id: `i-${n}`,
  ts,
  type: "INTEREST",
  grossAmount,
  taxWithheld,
  currency: "EUR",
  account: "test",
  source,
  externalId: `xi-${n}`,
});

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
        "The March sale takes the January lot whole: 850 − 1000 = −150. Its window runs from 20 January to 20 May 2025; the 4 bought on 3 March are inside it, earlier, and still held after the sale, so before = 4 and the repurchase is min(4, 4) = 4 of 10: 0.4 of the loss, −60, is not computable and stays on those 4 units; −90 computes in 2025. The 2026 sale of those 4 for 360 gains 360 − 320 = 40; it carries −60, nothing is bought in its window, so the −60 integrates in 2026 as its own line: 40 − 60 = −20 computable. Both years have a scale, but both bases are negative, so both quotas are 0.",
      figures: {
        "history.gains.0.realizedPnL": "-150",
        "history.gains.0.nonComputable": "-60",
        "history.gains.0.computablePnL": "-90",
        "years.2025.view.quota": "0",
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
    byHand: {
      arithmetic:
        "The two gains the core computes, 80 on the coin given in the swap and 68 on the token sold in September, make a base of 148. 2025 has the scale before NF 2/2025, and 148 falls in its first bracket: 148 × 0.20 = 29.6.",
      figures: {
        "years.2025.view.netSavingsBase": "148",
        "years.2025.view.quota": "29.6",
      },
    },
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
  {
    name: "Savings income beside a capital loss: in Bizkaia the two pools never compensate each other",
    residence: "bizkaia",
    instruments: [{ id: FUND, type: "ETF" }, { id: STOCK, type: "STOCK" }],
    events: [
      trade("BUY", FUND, "2026-01-12T09:00:00.000Z", "10", "1000"),
      trade("SELL", FUND, "2026-06-01T09:00:00.000Z", "10", "800"),
      dividend(STOCK, "2026-04-10T09:00:00.000Z", "100", "19"),
      interest(1, "2026-05-04T09:00:00.000Z", "50", "9.5"),
    ],
    years: [2026],
    byHand: {
      arithmetic:
        "Gains: 800 − 1000 = −200, carried. Income: dividend 100 + interest 50 = 150 gross. The dividend is a stock's and under 1500, so all of it is exempt (Art. 9.24): 50 enters the pool. The cross limit is 0, so the loss takes nothing from the income: base 0 + 50 = 50, quota 50 × 0.19 = 9.5. Withholdings 19 + 9.5 = 28.50 are shown apart and not subtracted, the exempt dividend's included.",
      figures: {
        "years.2026.view.netSavingsBase": "-200",
        "years.2026.view.savingsIncome.gross": "150.00",
        "years.2026.view.savingsIncome.exempt": "100.00",
        "years.2026.view.savingsBase": "50",
        "years.2026.view.quota": "9.5",
        "years.2026.view.withholdings.total": "28.50",
      },
    },
  },
  {
    name: "A year with a foreign dividend and its withholding in dollars, and interest that records none",
    residence: "bizkaia",
    instruments: [{ id: STOCK, type: "STOCK" }],
    events: [
      dividend(STOCK, "2026-03-16T14:00:00.000Z", "100", "15", {
        currency: "USD",
        fxSource: "ECB",
        fxRate: "1.25",
        fxDirection: "QUOTE_PER_BASE",
        fxDate: "2026-03-16",
      }),
      interest(2, "2026-07-01T09:00:00.000Z", "20", "0", "TR_CSV"),
    ],
    years: [2026],
    byHand: {
      arithmetic:
        "The dividend reaches euros at its own row's rate: 100 / 1.25 = 80 gross, 15 / 1.25 = 12 withheld. Income 80 + 20 = 100; the dividend is a stock's, so its 80 in euros is exempt and the limit is read in euros. Base 20, quota 20 × 0.19 = 3.8. Withholdings: 12, one figure with no split by origin. The interest is Trade Republic's and records 0 withheld, so the notice is raised; it changes no figure.",
      figures: {
        "years.2026.view.savingsIncome.gross": "100.00",
        "years.2026.view.savingsIncome.exempt": "80.00",
        "years.2026.view.savingsBase": "20",
        "years.2026.view.quota": "3.8",
        "years.2026.view.withholdings.total": "12.00",
      },
    },
  },
  {
    name: "A year before the first scale on file has none, and a year after the last keeps the one in force",
    residence: "bizkaia",
    instruments: [{ id: FUND, type: "ETF" }],
    events: [
      trade("BUY", FUND, "2024-01-10T09:00:00.000Z", "10", "1000"),
      trade("SELL", FUND, "2024-06-03T09:00:00.000Z", "10", "1100"),
    ],
    years: [2024, 2027],
    byHand: {
      arithmetic:
        "2024: 1100 − 1000 = 100 of base, but no scale is on file before 2025, so scale and quota are null. 2027 has no sale and a base of 0; the NF 2/2025 scale, in force from 1 January 2026 with no end date, is still the one that applies, so the quota is 0.",
      figures: {
        "years.2024.view.savingsBase": "100",
        "years.2024.view.scale": null,
        "years.2024.view.quota": null,
        "years.2027.view.scale.source":
          "Art. 76 NF 13/2013 de Bizkaia, redacción NF 2/2025, efectos 1-1-2026",
        "years.2027.view.quota": "0",
      },
    },
  },
  {
    name: "Dividends above the 1500 exemption, and an ETF's, which is never exempt",
    residence: "bizkaia",
    instruments: [
      { id: FUND, type: "ETF" },
      { id: STOCK, type: "STOCK" },
      { id: OTHER, type: "STOCK" },
    ],
    events: [
      dividend(STOCK, "2026-03-02T09:00:00.000Z", "1000", "190"),
      dividend(FUND, "2026-06-15T09:00:00.000Z", "200", "38"),
      dividend(OTHER, "2026-09-01T09:00:00.000Z", "800", "152"),
    ],
    years: [2026],
    byHand: {
      arithmetic:
        "Stock dividends 1000 + 800 = 1800, exempt up to 1500 (Art. 9.24): 300 over the limit enters the pool. The ETF's 200 is a fund's and is never exempt. Gross 2000, exempt 1500, pool 300 + 200 = 500, base 500, quota 500 × 0.19 = 95. Withholdings 190 + 38 + 152 = 380.00, the exempt dividends' included.",
      figures: {
        "years.2026.view.savingsIncome.gross": "2000.00",
        "years.2026.view.savingsIncome.exempt": "1500.00",
        "years.2026.view.savingsIncome.finalNet": "500",
        "years.2026.view.quota": "95",
        "years.2026.view.withholdings.total": "380.00",
      },
    },
  },
  {
    name: "Trade Republic interest paid on 1 January counts for the year before",
    residence: "bizkaia",
    instruments: [],
    events: [
      interest(3, "2026-01-01T13:10:00.000Z", "20", "3.8", "TR_CSV"),
      interest(4, "2026-02-01T03:08:00.000Z", "10", "1.9", "TR_CSV"),
    ],
    years: [2025, 2026],
    byHand: {
      arithmetic:
        "Trade Republic pays on the 1st the interest of the month before, so its interest counts on the Madrid day before the payment. The 20 paid on 1 January 2026 counts in 2025: base 20, quota 20 × 0.20 = 4 on the 2025 scale, withholding 3.80. The 10 paid on 1 February stays in 2026: base 10, quota 10 × 0.19 = 1.9, withholding 1.90.",
      figures: {
        "years.2025.view.savingsIncome.gross": "20.00",
        "years.2025.view.quota": "4",
        "years.2025.view.withholdings.total": "3.80",
        "years.2026.view.savingsIncome.gross": "10.00",
        "years.2026.view.quota": "1.9",
      },
    },
  },
  {
    name: "Trade Republic saveback enters the income pool and is never exempt; a Kraken reward stays out",
    residence: "bizkaia",
    instruments: [
      { id: STOCK, type: "STOCK" },
      { id: COIN, type: "CRYPTO" },
    ],
    events: [
      dividend(STOCK, "2026-03-02T09:00:00.000Z", "100", "19"),
      dividend(STOCK, "2026-05-04T09:00:00.000Z", "10", "1.9", {
        funding: "IN_KIND",
        source: "TR_CSV",
      }),
      dividend(COIN, "2026-06-01T09:00:00.000Z", "4", "0", {
        funding: "IN_KIND",
        source: "KRAKEN_CSV",
      }),
    ],
    years: [2026],
    byHand: {
      arithmetic:
        "The stock's cash dividend, 100, is exempt. The saveback is account income for Trade Republic, in money, at its value on receipt: 10 enters the pool and is not a dividend, so it is not exempt. Gross 100 + 10 = 110, exempt 100, pool 10, base 10, quota 10 × 0.19 = 1.9. Withholdings 19 + 1.9 = 20.90. The Kraken reward stays in kind, pending, added to nothing: inKindIncome 1 receipt of 4.00.",
      figures: {
        "years.2026.view.savingsIncome.gross": "110.00",
        "years.2026.view.savingsIncome.exempt": "100.00",
        "years.2026.view.savingsBase": "10",
        "years.2026.view.quota": "1.9",
        "years.2026.view.withholdings.total": "20.90",
        "years.2026.view.inKindIncome.gross": "4.00",
      },
    },
  },
  {
    name: "The same ledger in Bizkaia: a repurchased loss deferred under Art. 43.g, a stock dividend exempt up to 1500, pools apart",
    residence: "bizkaia",
    instruments: [{ id: STOCK, type: "STOCK" }],
    events: [
      trade("BUY", STOCK, "2025-01-10T10:00:00.000Z", "10", "1000"),
      trade("BUY", STOCK, "2025-03-03T10:00:00.000Z", "4", "320"),
      trade("SELL", STOCK, "2025-03-20T10:00:00.000Z", "10", "850"),
      dividend(STOCK, "2025-06-02T09:00:00.000Z", "2000", "380"),
    ],
    years: [2025],
    byHand: {
      arithmetic:
        "The March sale takes the January lot: 850 − 1000 = −150. The 4 bought on 3 March are inside the two-month window and still held, so 4 of 10 are repurchased: −60 is deferred and −90 computes. The dividend, 2000, is a stock's: 1500 is exempt (Art. 9.24), 500 enters the income pool. The cross limit is 0, so the −90 stays in its pool: base 500. 2025 has the scale before NF 2/2025: 500 × 0.20 = 100.",
      figures: {
        "history.gains.0.nonComputable": "-60",
        "history.gains.0.computablePnL": "-90",
        "years.2025.view.netSavingsBase": "-90",
        "years.2025.view.savingsIncome.exempt": "1500.00",
        "years.2025.view.savingsIncome.finalNet": "500",
        "years.2025.view.savingsBase": "500",
        "years.2025.view.quota": "100",
      },
    },
  },
  {
    name: "The same ledger in régimen común: the loss deferred under art. 33.5.f, no dividend exemption, the loss offsets the income up to 25%",
    residence: "comun",
    instruments: [{ id: STOCK, type: "STOCK" }],
    events: [
      trade("BUY", STOCK, "2025-01-10T10:00:00.000Z", "10", "1000"),
      trade("BUY", STOCK, "2025-03-03T10:00:00.000Z", "4", "320"),
      trade("SELL", STOCK, "2025-03-20T10:00:00.000Z", "10", "850"),
      dividend(STOCK, "2025-06-02T09:00:00.000Z", "2000", "380"),
    ],
    years: [2025],
    byHand: {
      arithmetic:
        "The repurchase is the same arithmetic under art. 33.5.f: −60 deferred, −90 computes. There is no dividend exemption, so all 2000 enters the income pool. The −90 crosses into it: min(90, 25% × 2000 = 500) = 90, so gains end at 0 and income at 1910. Base 1910; the común scale from 2025 taxes it at 19%: 1910 × 0.19 = 362.9.",
      figures: {
        "history.gains.0.nonComputable": "-60",
        "history.gains.0.computablePnL": "-90",
        "history.gains.0.washSale.source": "Art. 33.5.f Ley 35/2006 del IRPF",
        "years.2025.carryforward.steps.4.crossOffset": "90",
        "years.2025.view.netSavingsBase": "0",
        "years.2025.view.savingsIncome.exempt": "0.00",
        "years.2025.view.savingsIncome.finalNet": "1910",
        "years.2025.view.savingsBase": "1910",
        "years.2025.view.quota": "362.9",
      },
    },
  },
  {
    name: "In Canarias a sale at 23:30Z on 31 December still belongs to that year",
    residence: "canarias",
    instruments: [{ id: FUND, type: "ETF" }],
    events: [
      trade("BUY", FUND, "2025-06-02T09:00:00.000Z", "10", "1000"),
      trade("SELL", FUND, "2025-12-31T23:30:00.000Z", "10", "1200"),
    ],
    years: [2025, 2026],
    byHand: {
      arithmetic:
        "Atlantic/Canary is UTC+0 in winter, so 23:30Z is 23:30 on 31 December: the gain of 1200 − 1000 = 200 falls in 2025. 200 × 0.19 = 38. 2026 has nothing.",
      figures: {
        "years.2025.view.netSavingsBase": "200",
        "years.2025.view.quota": "38",
        "years.2026.view.netSavingsBase": "0",
      },
    },
  },
  {
    name: "In régimen común on the peninsula the same sale belongs to the next year",
    residence: "comun",
    instruments: [{ id: FUND, type: "ETF" }],
    events: [
      trade("BUY", FUND, "2025-06-02T09:00:00.000Z", "10", "1000"),
      trade("SELL", FUND, "2025-12-31T23:30:00.000Z", "10", "1200"),
    ],
    years: [2025, 2026],
    byHand: {
      arithmetic:
        "Europe/Madrid is UTC+1 in winter, so 23:30Z is 00:30 on 1 January 2026: 2025 has nothing and 2026 has the 200. 2026 keeps the 2025 scale in force: 200 × 0.19 = 38.",
      figures: {
        "years.2025.view.netSavingsBase": "0",
        "years.2026.view.netSavingsBase": "200",
        "years.2026.view.quota": "38",
      },
    },
  },
  {
    name: "Régimen común: a crypto loss rebought within the year computes whole, with only a notice",
    residence: "comun",
    instruments: [{ id: COIN, type: "CRYPTO" }],
    events: [
      trade("BUY", COIN, "2025-01-10T12:00:00.000Z", "1", "1000"),
      trade("SELL", COIN, "2025-03-03T12:00:00.000Z", "1", "700"),
      trade("BUY", COIN, "2025-04-01T12:00:00.000Z", "1", "720"),
    ],
    years: [2025],
    byHand: {
      arithmetic:
        "700 − 1000 = −300. Común has no repurchase rule for crypto, so nothing is deferred and the whole −300 computes; the purchase on 1 April is within a year, so the sale carries the notice (art. 33.5.e, unsettled). In Bizkaia the same sale falls under Art. 43.i and the whole loss would be deferred.",
      figures: {
        "history.gains.0.nonComputable": "0",
        "history.gains.0.computablePnL": "-300",
        "years.2025.taxYear.computableNet": "-300",
        "years.2025.view.quota": "0",
      },
    },
  },
  {
    name: "Régimen común: a crypto swap valued at the greater side, as in Bizkaia, under art. 37.1.h",
    residence: "comun",
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
    byHand: {
      arithmetic:
        "The same two gains as the Bizkaia swap, 80 and 68, base 148. The común scale's first bracket is 19%: 148 × 0.19 = 28.12.",
      figures: {
        "years.2025.view.netSavingsBase": "148",
        "years.2025.view.quota": "28.12",
      },
    },
  },
  {
    name: "Régimen común in 2024: no scale on file, so no quota",
    residence: "comun",
    instruments: [{ id: FUND, type: "ETF" }],
    events: [
      trade("BUY", FUND, "2024-02-01T09:00:00.000Z", "10", "1000"),
      trade("SELL", FUND, "2024-09-02T09:00:00.000Z", "10", "1100"),
    ],
    years: [2024],
    byHand: {
      arithmetic:
        "A gain of 100 in 2024. The first común scale on file is 2025's and a scale never reaches back, so scale and quota are null.",
      figures: {
        "years.2024.view.netSavingsBase": "100",
        "years.2024.view.scale": null,
        "years.2024.view.quota": null,
      },
    },
  },
  {
    name: "Régimen común: an earlier loss crosses into the year's income within what the year's own cross left of the 25%",
    residence: "comun",
    instruments: [
      { id: FUND, type: "ETF" },
      { id: OTHER, type: "STOCK" },
      { id: THIRD, type: "STOCK" },
    ],
    events: [
      trade("BUY", FUND, "2024-01-10T09:00:00.000Z", "10", "4000"),
      trade("SELL", FUND, "2024-06-03T09:00:00.000Z", "10", "1000"),
      trade("BUY", OTHER, "2025-01-10T09:00:00.000Z", "10", "1000"),
      trade("SELL", OTHER, "2025-06-02T09:00:00.000Z", "10", "600"),
      dividend(THIRD, "2025-07-01T09:00:00.000Z", "2000", "380"),
    ],
    years: [2025],
    byHand: {
      arithmetic:
        "2024 leaves a gains loss of 3000 pending. 2025: gains −400, income 2000 (no exemption). Phase 1: 400 crosses, under 25% × 2000 = 500; income 1600. Phase 2: income has nothing of its own pending; the 2024 loss crosses into its 1600 only up to 500 − 400 = 100. Income 1500, 2900 still pending. Base 1500 × 0.19 = 285.",
      figures: {
        "years.2025.carryforward.steps.4.crossOffset": "400",
        "years.2025.carryforward.steps.4.crossedToOther": "100",
        "years.2025.carryforward.steps.4.pendingLossRemaining": "2900",
        "years.2025.view.savingsIncome.finalNet": "1500",
        "years.2025.view.savingsBase": "1500",
        "years.2025.view.quota": "285",
      },
    },
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
            carryforward: {
              targetYear: year,
              steps: view.carryforward,
              netSavingsBase: view.netSavingsBase,
            },
            view: {
              affectedCount: view.affectedCount,
              ownNet: view.ownNet,
              nonComputableSum: view.nonComputableSum,
              integratedSum: view.integratedSum,
              computableNet: view.computableNet,
              pendingSum: view.pendingSum,
              netSavingsBase: view.netSavingsBase,
              savingsIncome: {
                count: view.savingsIncome.count,
                gross: view.savingsIncome.gross,
                exempt: view.savingsIncome.exempt,
                finalNet: view.savingsIncome.finalNet,
              },
              savingsBase: view.savingsBase,
              scale: view.scale,
              quota: view.quota,
              withholdings: view.withholdings,
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
    "The tax view, by residence: bizkaia is the Bizkaia foral territory in Europe/Madrid; comun and canarias are régimen común, in Europe/Madrid and Atlantic/Canary. FIFO, the repurchase rule (Bizkaia: Art. 43.g NF 13/2013 for listed securities, Art. 43.i for crypto from 2025-01-01, a notice for a crypto loss before; común: art. 33.5.f LIRPF for listed securities, no rule for crypto and a notice for every crypto loss rebought within a year), deferred losses and where they integrate, four-year carryforward and the savings-base quota. washSale.source and repurchaseWindow.source carry the rule's citation as the territory's table states it. Shared with the mobile client: both implementations must reproduce every case. Events are LedgerEvents; an absent fxSource is IDENTITY and an absent funding is CASH. assetClasses comes from each instrument's type (ETF, STOCK listed-security; CRYPTO fungible-crypto; BOND, COMMODITY, CASH unclassified). history is computeTaxHistory over the whole ledger; years holds, per requested year, taxYearOf, carryforward (the capital-gains pool of the two-pool walk in carryforward.json: targetYear, its steps and netSavingsBase, its final balance), and the figures of buildTaxYearView (sums to two places, the scale in force, the latest on file whose year is not after the requested one, and the quota: both null for a year before the first scale on file, because a scale never reaches back to a year before its own). The savings base has two pools, carried forward together as in carryforward.json: capital gains (netSavingsBase, the gains pool's final balance) and income from movable capital (savingsIncome: interest and cash dividends, gross in euros, and the in-kind dividends whose source is TR_CSV, Trade Republic's saveback, which it declares as account income in money, at their value on receipt; every other in-kind dividend, a Kraken reward, is left out and listed in inKindIncome; count and gross are the year's own (an INTEREST whose source is TR_CSV counts in the fiscal year of the day before its own in the residence's zone, because Trade Republic pays on the 1st the interest of the month before; every other income counts in the year of its own day), finalNet the pool's balance after its carryforward). Cash dividends (never a saveback) are exempt up to the territory's yearly limit in euros (Bizkaia: 1500, Art. 9.24 NF 13/2013; común has none, and exempt is 0.00); an ETF's never are, nor are those of an instrument missing from instruments; savingsIncome.exempt is the year's exempt amount, to two places, and the pool takes the year's gross less it. The two-month rule of Art. 9.24 is not applied. The pools cross as in carryforward.json, at the territory's limit: 0 in Bizkaia (Art. 66), so they never offset each other, and 25% in común (art. 49 LIRPF); savingsBase adds their positive final balances and the quota applies to it. withholdings.total is every withholding recorded on that income (cash dividends, interest and saveback; other in-kind income keeps its own in inKindIncome), in euros at each row's rate, to two places: payments on account of the whole IRPF, never subtracted from the quota; interestWithoutWithholding is true when some interest of the year whose source is TR_CSV records 0 (rows imported before interest carried its withholding), only for a notice; interest from any other source at 0 raises nothing. The repurchase rules, the swap valuation, the dividend exemption and the scales are tables both sides carry. Fiscal years and repurchase windows are calendar days in the residence's zone. Instants are ISO strings; a calendar day is {year, month, day}. Pending deferrals list oldest acquisition first, then by buy id. expect is written by running the TypeScript core; byHand.figures, where a case has it, are worked out by hand, its arithmetic says how, and each key is a dotted path into expect.",
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
