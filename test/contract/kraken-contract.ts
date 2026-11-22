import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  krakenSymbolFor,
  quoteSourceOf,
  readKrakenOhlc,
  readKrakenTrade,
} from "../../app/core/prices";

import { contractJson } from "./build";

export type KrakenInput =
  | { name: string; read: "ohlc" | "trade"; symbol: string; answer: unknown }
  | { name: string; read: "symbolFor"; codes: string[] }
  | { name: string; read: "sourceOf"; symbols: string[] };

type ByHand = { arithmetic: string; figures: Record<string, string | null> };

const cases: (KrakenInput & { byHand?: ByHand })[] = [
  {
    name: "The candle of the day still trading is dropped by last",
    read: "ohlc",
    symbol: "BTC/EUR",
    answer: {
      error: [],
      result: {
        "BTC/EUR": [
          [1795046400, "57421.6", "58227.9", "55965.3", "56467.6", "57163.0", "681.70258102", 26622],
          [1795132800, "56471.4", "57026.4", "52655.0", "53687.6", "54469.1", "1420.69116132", 53358],
          [1795219200, "53694.0", "53967.5", "53640.3", "53729.8", "53789.2", "116.50639245", 1711],
        ],
        last: 1795132800,
      },
    },
    byHand: {
      arithmetic:
        "last = 1795132800 = 2026-11-20T00:00Z, so the 2026-11-21 candle (1795219200) is open and goes; the close is the fifth field.",
      figures: {
        "value.0.price": "56467.6",
        "value.1.price": "53687.6",
        "value.1.asOf": "2026-11-20T00:00:00.000Z",
      },
    },
  },
  {
    name: "A candle is dated at its time, 00:00 UTC of its day",
    read: "ohlc",
    symbol: "DOGE/EUR",
    answer: {
      error: [],
      result: {
        "DOGE/EUR": [
          [1795132800, "0.0530800", "0.0531810", "0.0479251", "0.0495267", "0.0500437", "29057539.73685795", 3342],
          [1795219200, "0.0495794", "0.0497622", "0.0494232", "0.0495093", "0.0495566", "858466.89665987", 128],
        ],
        last: 1795132800,
      },
    },
    byHand: {
      arithmetic: "1795132800 s = 20 776 days × 86 400 s = 2026-11-20T00:00Z.",
      figures: {
        "value.0.asOf": "2026-11-20T00:00:00.000Z",
        "value.0.currency": "EUR",
      },
    },
  },
  {
    name: "A price below a millionth is kept with every digit it came with",
    read: "ohlc",
    symbol: "PEPE/EUR",
    answer: {
      error: [],
      result: {
        "PEPE/EUR": [
          [1795046400, "0.000003411", "0.000003672", "0.000003325", "0.000003386", "0.000003483", "165445561268.25252", 1888],
          [1795132800, "0.000003380", "0.000003404", "0.000003049", "0.000003167", "0.000003169", "197646363852.90768", 2645],
          [1795219200, "0.000003165", "0.000003165", "0.000003128", "0.000003135", "0.000003139", "7036739295.93027", 75],
        ],
        last: 1795132800,
      },
    },
    byHand: {
      arithmetic: "The close is text and is kept as it came: no rounding to places.",
      figures: { "value.0.price": "0.000003386", "value.1.price": "0.000003167" },
    },
  },
  {
    name: "Trailing zeros of a price are not kept",
    read: "ohlc",
    symbol: "DOGE/EUR",
    answer: {
      error: [],
      result: {
        "DOGE/EUR": [
          [1795132800, "0.0530800", "0.0531810", "0.0479251", "0.0530800", "0.0500437", "29057539.73685795", 3342],
        ],
        last: 1795132800,
      },
    },
    byHand: {
      arithmetic: "0.0530800 and 0.05308 are the same number; the shortest text is stored.",
      figures: { "value.0.price": "0.05308" },
    },
  },
  {
    name: "A dollar pair is priced in dollars",
    read: "ohlc",
    symbol: "USDG/USD",
    answer: {
      error: [],
      result: {
        "USDG/USD": [
          [1795132800, "1.0000", "1.0001", "0.9996", "0.9999", "0.9999", "8181194.58488", 2989],
          [1795219200, "0.9999", "1.0001", "0.9999", "1.0000", "0.9999", "216881.67434", 156],
        ],
        last: 1795132800,
      },
    },
    byHand: {
      arithmetic: "The currency is what follows the «/» of the symbol.",
      figures: { "value.0.currency": "USD", "value.0.price": "0.9999" },
    },
  },
  {
    name: "The answer may name the pair by Kraken's own key",
    read: "ohlc",
    symbol: "BTC/EUR",
    answer: {
      error: [],
      result: {
        XXBTZEUR: [
          [1795132800, "56471.4", "57026.4", "52655.0", "53687.6", "54469.1", "1420.69116132", 53358],
          [1795219200, "53694.0", "53967.5", "53640.3", "53729.8", "53789.2", "116.50639245", 1711],
        ],
        last: 1795132800,
      },
    },
    byHand: {
      arithmetic: "BTCEUR is answered under XXBTZEUR; the only key besides last is the pair.",
      figures: { "value.0.symbol": "BTC/EUR", "value.0.price": "53687.6" },
    },
  },
  {
    name: "An unknown pair is an empty answer",
    read: "ohlc",
    symbol: "NOSUCH/EUR",
    answer: { error: ["EQuery:Unknown asset pair"] },
  },
  {
    name: "A pair Kraken calls invalid is an empty answer too",
    read: "ohlc",
    symbol: "MATIC/EUR",
    answer: { error: ["EQuery:Invalid asset pair"] },
  },
  {
    name: "Any other error is not an answer",
    read: "ohlc",
    symbol: "BTC/EUR",
    answer: { error: ["EGeneral:Too many requests"] },
    byHand: {
      arithmetic: "A rate limit says nothing about the pair, so it must not read as no history.",
      figures: { error: "EGeneral:Too many requests" },
    },
  },
  {
    name: "The last trade is the live quote, dated to the second",
    read: "trade",
    symbol: "BTC/EUR",
    answer: {
      error: [],
      result: {
        "BTC/EUR": [["53736.00000", "0.05582849", 1795225211.7947261, "s", "l", "", 110692128]],
        last: "1795225211794726034",
      },
    },
    byHand: {
      arithmetic: "floor(1795225211.79) s = 2026-11-21T01:40:11Z; 53736.00000 is 53736.",
      figures: { "value.price": "53736", "value.asOf": "2026-11-21T01:40:11.000Z" },
    },
  },
  {
    name: "No trade is no live quote",
    read: "trade",
    symbol: "BTC/EUR",
    answer: { error: [], result: { "BTC/EUR": [], last: "0" } },
  },
  {
    name: "The pair suggested for a crypto code",
    read: "symbolFor",
    codes: ["BTC", "DOGE", "PEPE", "USDG"],
    byHand: {
      arithmetic: "Kraken takes BTC and DOGE for XBT and XDG; USDG has no euro pair.",
      figures: { BTC: "BTC/EUR", DOGE: "DOGE/EUR", USDG: "USDG/USD" },
    },
  },
  {
    name: "Who prices a symbol",
    read: "sourceOf",
    symbols: ["BTC/EUR", "BTC-EUR", "VWCE.DE"],
    byHand: {
      arithmetic: "Only a symbol with «/» is a Kraken pair.",
      figures: { "BTC/EUR": "KRAKEN", "BTC-EUR": "YAHOO" },
    },
  },
];

export function evaluate(input: KrakenInput): unknown {
  switch (input.read) {
    case "ohlc":
      return readKrakenOhlc(input.answer, input.symbol);
    case "trade":
      return readKrakenTrade(input.answer, input.symbol);
    case "symbolFor":
      return Object.fromEntries(input.codes.map((c) => [c, krakenSymbolFor(c)]));
    case "sourceOf":
      return Object.fromEntries(
        input.symbols.map((s) => [s, quoteSourceOf(s)]),
      );
  }
}

export const KRAKEN_CONTRACT_FILE = fileURLToPath(
  new URL("./kraken.json", import.meta.url),
);

export function krakenContractJson(): string {
  return contractJson(
    "kraken",
    "Kraken's public market data read into quotes. read ohlc is OHLC?interval=1440: one quote per closed daily candle, its close as the price, dated at the candle's time (00:00 UTC; the candle carries the close of 24:00), sorted by time; candles after result.last are the day still trading and are dropped. read trade is Trades?count=1: the last trade as the live quote, dated to the whole second. The pair is the only key of result besides last, whatever its name; the currency is what follows the «/» of the symbol; a price is kept as its shortest decimal text. An error EQuery:Unknown asset pair or EQuery:Invalid asset pair is an empty answer (no candles, no quote); any other error is { ok: false, error } with the errors joined by «; ». symbolFor is the pair suggested for a crypto code (BASE/EUR, BASE/USD where Kraken has no euro pair). sourceOf decides who prices a symbol: KRAKEN when it has a «/», else YAHOO. Shared with the mobile client: both implementations must reproduce every case. expect is written by running the TypeScript core; byHand.figures, where a case has it, are worked out by hand, its arithmetic says how, and each key is a dotted path into expect.",
    cases.map(({ byHand, ...input }) => ({
      ...input,
      ...(byHand ? { byHand } : {}),
      expect: evaluate(input),
    })),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(KRAKEN_CONTRACT_FILE, krakenContractJson());
}
