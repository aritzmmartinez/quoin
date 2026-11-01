import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  CsvFileError,
  InvalidLedgerEventError,
  KrakenBalanceMismatchError,
  KrakenCsvAdapter,
  KrakenLegacyExportError,
  REWARD_NOTE,
  TradeRepublicCsvAdapter,
  countOperations,
  decodeCsv,
  detectBroker,
  type MappedBatch,
} from "../../app/adapters/ingestion";
import { krakenCsv } from "../../app/adapters/ingestion/kraken/csv-fixture";
import type { Instrument, LedgerEvent } from "../../app/core/domain";
import { rateBookFrom } from "../../app/core/fx";
import type {
  FxRate,
  InstrumentRepository,
  LedgerRepository,
  PriceRepository,
  PriceSnapshot,
} from "../../app/core/ports";

export interface IngestPrice {
  instrumentId: string;
  price: string;
  currency: string;
  asOf: string;
  source: string;
}

export interface IngestInput {
  name: string;
  zone: string;
  encoding: "utf-8" | "latin1";
  csv: string;
  rates: FxRate[];
  prices: IngestPrice[];
  stored: {
    names: Record<string, string>;
    rewardRefids: string[];
    existing: string[];
  };
}

type Case = Omit<
  IngestInput,
  "zone" | "encoding" | "rates" | "prices" | "stored"
> &
  Partial<Pick<IngestInput, "encoding" | "rates" | "prices">> & {
    stored?: Partial<IngestInput["stored"]>;
  };

const MADRID = "Europe/Madrid";
const BOM = String.fromCharCode(0xfeff);

const TR_HEADER =
  "datetime,category,type,asset_class,name,symbol,shares,price,amount,fee,tax,currency,transaction_id";
const FUND = "XS00TEST0001";
const STOCK = "XS00TEST0002";
const USD_STOCK = "XS00TEST0003";
const BOND = "XS00TEST0004";
const COIN = "TESTCOIN";
const TOKEN = "TESTTOKEN";

const tr = (...rows: string[]) => [TR_HEADER, ...rows].join("\n");

const usd = (day: string, rate: string): FxRate => ({
  base: "EUR",
  quote: "USD",
  day,
  rate,
  source: "ECB",
});

const cases: Case[] = [
  {
    name: "Neither broker's signature column: unknown broker",
    csv: "name,isin,weight\nTest Fund,XS00TEST0001,100",
  },
  {
    name: "Both signature columns: refused rather than guessed",
    csv: "refid,transaction_id,type\nR1,T1,BUY",
  },
  {
    name: "Bytes that are not UTF-8: refused before anything is read",
    encoding: "latin1",
    csv: tr(
      `2025-01-10T09:00:00Z,TRADING,BUY,FUND,Fondo Café,${FUND},1,100,-100,,,EUR,t1`,
    ),
  },
  {
    name: "Trade Republic, a BOM, CRLF and blank lines: read as plain rows",
    csv: `${BOM}${TR_HEADER}\r\n\r\n2025-01-10T09:00:00Z,TRADING,BUY,FUND,Test Fund,${FUND},2,50,-100,-1,,EUR,t1\r\n,,,,,,,,,,,,\r\n\r\n`,
  },
  {
    name: "Trade Republic in EUR: buys and a partial sale with fees, a taxed dividend, interest, a deposit, a withdrawal and a card payment",
    csv: tr(
      `2025-01-10T09:00:00Z,TRADING,BUY,FUND,Test Fund,${FUND},10,100,-1000,-1,,EUR,t1`,
      `2025-02-10T09:00:00.000+01:00,TRADING,BUY,STOCK,Test Stock,${STOCK},3,50.5,-151.5,-1,,EUR,t2`,
      `2025-03-10T09:00:00Z,TRADING,SELL,FUND,Test Fund,${FUND},4,110,440,-1,-2.5,EUR,t3`,
      `2025-04-10T09:00:00Z,CASH,DIVIDEND,STOCK,Test Stock,${STOCK},,,3.6,,-0.68,EUR,t4`,
      `2025-05-01T09:00:00Z,CASH,INTEREST_PAYMENT,,,,,,1.23,,,EUR,t5`,
      `2025-05-02T09:00:00Z,CASH,CUSTOMER_INPAYMENT,,,,,,500,,,EUR,t6`,
      `2025-05-03T09:00:00Z,CASH,TRANSFER_INSTANT_OUTBOUND,,,,,,-50,,,EUR,t7`,
      `2025-05-04T09:00:00Z,CASH,CARD_TRANSACTION,,Test Shop,,,,-9.99,,,EUR,t8`,
    ),
  },
  {
    name: "Trade Republic, re-imported: rows already in the ledger are duplicates",
    csv: tr(
      `2025-01-10T09:00:00Z,TRADING,BUY,FUND,Test Fund,${FUND},1,100,-100,,,EUR,t1`,
      `2025-01-11T09:00:00Z,TRADING,BUY,FUND,Test Fund,${FUND},1,101,-101,,,EUR,t2`,
    ),
    stored: { existing: ["TR_CSV::t1"] },
  },
  {
    name: "Trade Republic saveback, both regimes and one with no purchase",
    csv: tr(
      `2025-10-01T08:00:00Z,CASH,BENEFITS_SAVEBACK,,Test Fund,${FUND},,,15,,,EUR,s1`,
      `2025-10-03T09:00:00Z,TRADING,BUY,FUND,Test Fund,${FUND},0.15,100,-15,,-2.85,EUR,b1`,
      `2025-12-01T08:00:00Z,CASH,BENEFITS_SAVEBACK,,,,,,15,,-2.85,EUR,s2`,
      `2025-12-02T09:00:00Z,TRADING,BUY,FUND,Test Fund,${FUND},0.1215,100,-12.15,,,EUR,b2`,
      `2026-01-05T08:00:00Z,CASH,BENEFITS_SAVEBACK,,,,,,7,,,EUR,s3`,
    ),
  },
  {
    name: "Trade Republic rows in another currency, one day with an ECB rate and one without",
    csv: tr(
      `2025-03-03T15:00:00Z,TRADING,BUY,STOCK,Test US Stock,${USD_STOCK},2,100,-200,-1,,USD,u1`,
      `2025-03-04T15:00:00Z,TRADING,BUY,STOCK,Test US Stock,${USD_STOCK},1,101,-101,,,USD,u2`,
    ),
    rates: [usd("2025-03-03", "1.0500")],
  },
  {
    name: "Trade Republic asset classes Quoin does not read: set aside by name, a trade flagged and a dividend not",
    csv: tr(
      `2025-06-02T09:00:00Z,TRADING,BUY,BOND,Test Bond,${BOND},1,99,-99,-1,,EUR,x1`,
      `2025-06-03T09:00:00Z,CASH,DIVIDEND,BOND,Test Bond,${BOND},,,2.5,,,EUR,x2`,
      `2025-06-04T09:00:00Z,TRADING,SELL,DERIVATIVE,Test Option,XS00TEST0005,1,5,5,-1,,EUR,x3`,
    ),
  },
  {
    name: "Trade Republic rows it cannot read: each named, the rest imported",
    csv: tr(
      `2025-07-01T09:00:00,TRADING,BUY,FUND,Test Fund,${FUND},1,100,-100,,,EUR,m1`,
      `2025-07-02T09:00:00Z,TRADING,BUY,FUND`,
      `2025-07-03T09:00:00Z,TRADING,BUY,FUND,Test Fund,${FUND},,100,-100,,,EUR,m3`,
      `2025-07-04T09:00:00Z,TRADING,BUY,FUND,Test Fund,,1,100,-100,,,EUR,m4`,
      `2025-07-05T09:00:00Z,TRADING,BUY,FUND,Test Fund,${FUND},1,100,-100,,,EUR,m5`,
    ),
  },
  {
    name: "Trade Republic with a column missing: refused, naming it",
    csv: [
      TR_HEADER.replace(",asset_class", ""),
      `2025-01-10T09:00:00Z,TRADING,BUY,Test Fund,${FUND},1,100,-100,,,EUR,t1`,
    ].join("\n"),
  },
  {
    name: "Trade Republic saved with ';': recognised, then refused as unparseable",
    csv: [
      TR_HEADER.replaceAll(",", ";"),
      `2025-01-10T09:00:00Z;TRADING;BUY;FUND;Test Fund;${FUND};1;100;-100;;;EUR;t1`,
    ].join("\n"),
  },
  {
    name: "Kraken in EUR: a deposit, a buy with a fee in fiat, a sale, and a withdrawal",
    csv: krakenCsv([
      {
        refid: "D1",
        time: "2025-02-01 10:00:00",
        type: "deposit",
        subclass: "fiat",
        asset: "EUR",
        amount: "1000",
      },
      {
        refid: "B1",
        time: "2025-02-02 10:00:00",
        type: "spend",
        subclass: "fiat",
        asset: "EUR",
        amount: "-500",
        fee: "2",
      },
      {
        refid: "B1",
        time: "2025-02-02 10:00:00",
        type: "receive",
        subclass: "crypto",
        asset: COIN,
        amount: "0.5",
      },
      {
        refid: "S1",
        time: "2025-03-02 10:00:00",
        type: "spend",
        subclass: "crypto",
        asset: COIN,
        amount: "-0.2",
      },
      {
        refid: "S1",
        time: "2025-03-02 10:00:00",
        type: "receive",
        subclass: "fiat",
        asset: "EUR",
        amount: "240",
        fee: "1",
      },
      {
        refid: "W1",
        time: "2025-03-03 10:00:00",
        type: "withdrawal",
        subclass: "fiat",
        asset: "EUR",
        amount: "-200",
      },
    ]),
  },
  {
    name: "Kraken rewards: at Kraken's own USD figure, from the price history, and one with neither",
    csv: krakenCsv([
      {
        refid: "R1",
        time: "2025-04-01 12:00:00",
        type: "earn",
        subtype: "reward",
        subclass: "crypto",
        asset: COIN,
        amount: "0.001",
        amountusd: "1.10",
        feeusd: "0.05",
      },
      {
        refid: "R2",
        time: "2025-04-08 12:00:00",
        type: "reward",
        subclass: "crypto",
        asset: COIN,
        amount: "0.002",
      },
      {
        refid: "R3",
        time: "2025-04-08 12:00:00",
        type: "reward",
        subclass: "crypto",
        asset: TOKEN,
        amount: "3",
      },
    ]),
    rates: [usd("2025-04-01", "1.0800")],
    prices: [
      {
        instrumentId: COIN,
        price: "1000",
        currency: "EUR",
        asOf: "2025-04-06T00:00:00.000Z",
        source: "YAHOO",
      },
    ],
  },
  {
    name: "Kraken swap between two crypto assets at Kraken's USD figure",
    csv: krakenCsv([
      {
        refid: "X2",
        time: "2025-05-06 10:00:00",
        type: "spend",
        subclass: "crypto",
        asset: COIN,
        amount: "-0.5",
        amountusd: "-540",
      },
      {
        refid: "X2",
        time: "2025-05-06 10:00:00",
        type: "receive",
        subclass: "crypto",
        asset: TOKEN,
        amount: "100",
        fee: "1",
        amountusd: "540",
        feeusd: "5.4",
      },
    ]),
    rates: [usd("2025-05-06", "1.1320")],
  },
  {
    name: "Kraken trades with nothing on one side: a fee that takes every unit, and a purchase that pays no fiat",
    csv: krakenCsv([
      {
        refid: "Z1",
        time: "2025-06-01 10:00:00",
        type: "spend",
        subclass: "fiat",
        asset: "EUR",
        amount: "-80",
      },
      {
        refid: "Z1",
        time: "2025-06-01 10:00:00",
        type: "receive",
        subclass: "crypto",
        asset: COIN,
        amount: "0.001",
        fee: "0.001",
      },
      {
        refid: "Z2",
        time: "2025-06-02 10:00:00",
        type: "spend",
        subclass: "fiat",
        asset: "EUR",
        amount: "0",
      },
      {
        refid: "Z2",
        time: "2025-06-02 10:00:00",
        type: "receive",
        subclass: "crypto",
        asset: COIN,
        amount: "0.001",
      },
    ]),
  },
  {
    name: "Kraken internal move booked as a reward by an earlier import, and an operation whose time cannot be read",
    csv: krakenCsv([
      {
        refid: "I1",
        time: "2025-07-01 10:00:00",
        type: "earn",
        subtype: "allocation",
        subclass: "crypto",
        asset: COIN,
        amount: "0",
      },
      {
        refid: "I2",
        time: "not a time",
        type: "deposit",
        subclass: "fiat",
        asset: "EUR",
        amount: "10",
      },
    ]),
    stored: { rewardRefids: ["I1"], names: { [COIN]: "Test Coin" } },
  },
  {
    name: "Kraken export of the old format, without a wallet column: refused",
    csv: [
      "txid,refid,time,type,subtype,aclass,asset,amount,fee,balance",
      `"L1","D1","2021-03-01 10:00:00","deposit","","currency","ZEUR",200,0,200`,
    ].join("\n"),
  },
  {
    name: "Kraken balance that does not follow from the rows before it: refused, naming where",
    csv: krakenCsv([
      {
        refid: "D1",
        time: "2025-02-01 10:00:00",
        type: "deposit",
        subclass: "fiat",
        asset: "EUR",
        amount: "100",
      },
      {
        refid: "D2",
        time: "2025-02-02 10:00:00",
        type: "deposit",
        subclass: "fiat",
        asset: "EUR",
        amount: "50",
        balance: "160",
      },
    ]),
  },
];

class StoredInstruments implements Pick<InstrumentRepository, "list"> {
  constructor(private readonly names: Record<string, string>) {}
  async list(): Promise<Instrument[]> {
    return Object.entries(this.names).map(([id, name]) => ({
      id,
      name,
      type: "CRYPTO",
      thesis: "CORE",
    }));
  }
}

class StoredLedger implements Pick<LedgerRepository, "list" | "existing"> {
  constructor(private readonly stored: IngestInput["stored"]) {}
  async list(): Promise<LedgerEvent[]> {
    return this.stored.rewardRefids.map((refid) => ({
      id: refid,
      ts: new Date(0),
      type: "BUY",
      instrumentId: "",
      quantity: "1",
      price: "1",
      grossAmount: "1",
      fees: "0",
      currency: "EUR",
      account: "kraken",
      source: "KRAKEN_CSV",
      externalId: refid,
      note: REWARD_NOTE,
    }));
  }
  async existing(): Promise<Set<string>> {
    return new Set(this.stored.existing);
  }
}

class StoredPrices implements Pick<PriceRepository, "historyFor"> {
  constructor(private readonly prices: readonly IngestPrice[]) {}
  async historyFor(instrumentId: string): Promise<PriceSnapshot[]> {
    return this.prices
      .filter((price) => price.instrumentId === instrumentId)
      .map((price) => ({ ...price, asOf: new Date(price.asOf) }));
  }
}

function rejection(error: unknown): Record<string, unknown> {
  if (error instanceof CsvFileError) {
    return {
      reason: error.reason,
      ...(error.column === null ? {} : { column: error.column }),
      ...(error.row === null ? {} : { row: error.row }),
    };
  }
  if (error instanceof KrakenLegacyExportError)
    return { reason: "kraken-legacy-export" };
  if (error instanceof KrakenBalanceMismatchError) {
    return {
      reason: "kraken-balance-mismatch",
      asset: error.asset,
      wallet: error.wallet,
      date: error.date,
    };
  }
  if (error instanceof InvalidLedgerEventError) {
    return {
      reason: "invalid-ledger-event",
      date: error.date,
      type: error.type,
      currency: error.currency,
    };
  }
  throw error;
}

function outcome(batch: MappedBatch, existing: readonly string[]) {
  return {
    total: batch.total,
    instruments: batch.instruments,
    events: batch.events.map(({ id: _id, ...event }) => event),
    operationOf: batch.operationOf,
    discarded: batch.discarded,
    discardedDetails: batch.discardedDetails,
    noticed: batch.noticed,
    errors: batch.errors,
    ratesNeeded: Object.fromEntries(batch.ratesNeeded),
    ...countOperations(batch, new Set(existing)),
  };
}

export async function evaluate(input: IngestInput): Promise<unknown> {
  const bytes = Buffer.from(
    input.csv,
    input.encoding === "latin1" ? "latin1" : "utf8",
  );
  let csv: string;
  try {
    csv = decodeCsv(bytes);
  } catch (error) {
    return { broker: null, rejected: rejection(error) };
  }
  const broker = detectBroker(csv);
  if (broker === null)
    return { broker, rejected: { reason: "unknown-broker" } };

  const instruments = new StoredInstruments(
    input.stored.names,
  ) as unknown as InstrumentRepository;
  const ledger = new StoredLedger(input.stored) as unknown as LedgerRepository;
  const rates = async () => rateBookFrom(input.rates);
  const adapter =
    broker === "kraken"
      ? new KrakenCsvAdapter(
          instruments,
          ledger,
          input.zone,
          new StoredPrices(input.prices) as unknown as PriceRepository,
          rates,
        )
      : new TradeRepublicCsvAdapter(instruments, ledger, input.zone, rates);
  try {
    return {
      broker,
      ...outcome(await adapter.plan(csv), input.stored.existing),
    };
  } catch (error) {
    return { broker, rejected: rejection(error) };
  }
}

export function inputOf(c: Case): IngestInput {
  return {
    name: c.name,
    zone: MADRID,
    encoding: c.encoding ?? "utf-8",
    csv: c.csv,
    rates: c.rates ?? [],
    prices: c.prices ?? [],
    stored: {
      names: c.stored?.names ?? {},
      rewardRefids: c.stored?.rewardRefids ?? [],
      existing: c.stored?.existing ?? [],
    },
  };
}

export const INGEST_CONTRACT_FILE = fileURLToPath(
  new URL("./ingest.json", import.meta.url),
);

export async function ingestContractJson(): Promise<string> {
  const evaluated = await Promise.all(
    cases.map(async (c) => {
      const input = inputOf(c);
      return { ...input, expect: await evaluate(input) };
    }),
  );
  return `${JSON.stringify(
    {
      contract: "ingest",
      version: 1,
      description:
        "What a broker CSV becomes before anything is written: the broker detected, then instruments, ledger events, discards with their detail, notices, named row errors, the currencies whose ECB rates are missing, and how many operations are new against the keys already stored — or the whole file refused with a named reason. Shared with the mobile client: both implementations must reproduce every case. Input: the csv text is encoded as `encoding` and decoded as strict UTF-8 (a BOM is dropped); `rates` is the ECB rate book, a row booked at the rate of its own day in `zone`; `prices` is the price history Kraken rewards and swaps fall back to; `stored.names` are instrument names already stored (they win over the file's), `stored.rewardRefids` are Kraken refids an earlier import booked as rewards, and `stored.existing` are ledger keys `source::externalId`. Output: events omit `id`, which is random; ts is ISO; operationOf gives each event's operation; a row error names the row by externalId, date and type as written, and by its 1-based position among the file's non-empty records only when it has no id. Detection splits the first non-empty line on , ; tab or |; parsing reads commas only. expect is written by running the TypeScript adapters.",
      cases: evaluated,
    },
    null,
    2,
  )}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(INGEST_CONTRACT_FILE, await ingestContractJson());
}
