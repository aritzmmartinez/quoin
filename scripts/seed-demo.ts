import "dotenv/config";

import { argv, exit } from "node:process";

import Decimal from "decimal.js";

import { prisma } from "~/adapters/persistence";

import { assertScratchDatabase } from "./lib/db-target";

/**
 * Fill a scratch database with a synthetic portfolio, so development and agent work
 * never need the real ledger.
 *
 * Everything here is invented. Instrument names, ISINs and fund constituents are made
 * up on purpose: the set of funds whose compositions are held IS the portfolio, so a
 * "realistic" seed would publish it as surely as committing a quoteSymbol would.
 *
 */

const USAGE = `Usage:
  pnpm db:seed                      seed with today as the anchor date
  pnpm db:seed --anchor=YYYY-MM-DD  seed deterministically from a fixed date`;

const MONTHS = 14;
const SLEEVE_CORE = "CORE";
const SLEEVE_TRADING = "TRADING";

interface DemoInstrument {
  id: string;
  name: string;
  type: string;
  currency: string;
  assetClass: string | null;
  quoteSymbol: string | null;
  exposureKind: string | null;
  exposureLeafId: string | null;
  ter: string | null;
  seedPrice: number | null;
  drift: number;
  volatility: number;
}

const INSTRUMENTS: readonly DemoInstrument[] = [
  {
    id: "IE00DEMO0001",
    name: "Demo World Equity UCITS ETF Acc",
    type: "ETF",
    currency: "EUR",
    assetClass: "FUND",
    quoteSymbol: "DEMOW.DE",
    exposureKind: "EQUITY_FUND",
    exposureLeafId: null,
    ter: "0.0022",
    seedPrice: 98.4,
    drift: 0.00042,
    volatility: 0.0079,
  },
  {
    id: "IE00DEMO0002",
    name: "Demo Physical Gold ETC",
    type: "ETF",
    currency: "EUR",
    assetClass: "SYNTHETIC",
    quoteSymbol: "DEMOG.DE",
    exposureKind: "COMMODITY",
    exposureLeafId: "XAU",
    ter: "0.0012",
    seedPrice: 51.2,
    drift: 0.00051,
    volatility: 0.0068,
  },
  {
    id: "NL00DEMO0003",
    name: "Demo Semiconductors NV",
    type: "STOCK",
    currency: "EUR",
    assetClass: "STOCK",
    quoteSymbol: "DEMS.AS",
    exposureKind: "COMPANY",
    exposureLeafId: null,
    ter: null,
    seedPrice: 412.5,
    drift: 0.00088,
    volatility: 0.0184,
  },
  {
    id: "BTC",
    name: "Bitcoin",
    type: "CRYPTO",
    currency: "EUR",
    assetClass: "CRYPTO",
    quoteSymbol: "BTC-EUR",
    exposureKind: "CRYPTO",
    exposureLeafId: "BTC",
    ter: null,
    seedPrice: 58400,
    drift: 0.0011,
    volatility: 0.0291,
  },
  {
    id: "IE00DEMO0005",
    name: "Demo Europe Small Cap UCITS ETF",
    type: "ETF",
    currency: "EUR",
    assetClass: "FUND",
    quoteSymbol: "DEMOE.DE",
    exposureKind: "EQUITY_FUND",
    exposureLeafId: null,
    ter: "0.0040",
    seedPrice: 33.7,
    drift: 0.00026,
    volatility: 0.0102,
  },
  {
    id: "LU00DEMO0006",
    name: "Demo Global Aggregate Bond Fund",
    type: "ETF",
    currency: "EUR",
    assetClass: "FUND",
    quoteSymbol: null,
    exposureKind: "BOND_FUND",
    exposureLeafId: null,
    ter: null,
    seedPrice: null,
    drift: 0,
    volatility: 0,
  },
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

function parseAnchor(): Date {
  const flag = argv.slice(2).find((a) => a.startsWith("--anchor="));
  if (!flag) {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  const value = flag.slice("--anchor=".length);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    console.error(`Invalid --anchor "${value}".\n\n${USAGE}`);
    exit(1);
  }
  return parsed;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function priceSeries(
  instrument: DemoInstrument,
  from: Date,
  to: Date,
): { asOf: Date; price: Decimal }[] {
  if (instrument.seedPrice === null) return [];

  const random = mulberry32(hashSeed(instrument.id));
  const series: { asOf: Date; price: Decimal }[] = [];
  let price = new Decimal(instrument.seedPrice);

  for (let day = new Date(from); day <= to; day = addDays(day, 1)) {
    if (instrument.type !== "CRYPTO" && isWeekend(day)) continue;

    const shock = (random() - 0.5) * 2 * instrument.volatility;
    price = price.mul(1 + instrument.drift + shock);

    series.push({
      asOf: new Date(
        Date.UTC(
          day.getUTCFullYear(),
          day.getUTCMonth(),
          day.getUTCDate(),
          17,
          30,
        ),
      ),
      price: price.toDecimalPlaces(instrument.id === "BTC" ? 2 : 4),
    });
  }

  return series;
}

function priceOn(
  series: readonly { asOf: Date; price: Decimal }[],
  when: Date,
): Decimal {
  let chosen = series[0]?.price ?? new Decimal(1);
  for (const point of series) {
    if (point.asOf.getTime() > when.getTime()) break;
    chosen = point.price;
  }
  return chosen;
}

interface LedgerRow {
  id: string;
  ts: Date;
  type: string;
  sleeve: string | null;
  instrumentId: string | null;
  quantity: string | null;
  price: string | null;
  grossAmount: string;
  fees: string;
  taxWithheld: string;
  currency: string;
  fxToBase: string;
  account: string;
  source: string;
  externalId: string;
  note: string | null;
}

function buildLedger(
  anchor: Date,
  seriesById: ReadonlyMap<string, { asOf: Date; price: Decimal }[]>,
): LedgerRow[] {
  const rows: LedgerRow[] = [];
  let sequence = 0;

  const next = (): string => {
    sequence += 1;
    return String(sequence).padStart(4, "0");
  };

  const trade = (
    ts: Date,
    type: "BUY" | "SELL",
    instrumentId: string,
    sleeve: string,
    amount: Decimal,
    fee: Decimal,
    note?: string,
  ): void => {
    const series = seriesById.get(instrumentId) ?? [];
    const price = priceOn(series, ts);
    const quantity = amount.div(price).toDecimalPlaces(6);
    const gross = quantity.mul(price).toDecimalPlaces(2);
    const id = next();

    rows.push({
      id: `demo-${id}`,
      ts,
      type,
      sleeve,
      instrumentId,
      quantity: quantity.toFixed(6),
      price: price.toFixed(4),
      grossAmount: gross.toFixed(2),
      fees: fee.toFixed(2),
      taxWithheld: "0",
      currency: "EUR",
      fxToBase: "1",
      account: "demo-broker",
      source: "DEMO",
      externalId: `DEMO-${id}`,
      note: note ?? null,
    });
  };

  const cash = (
    ts: Date,
    type: string,
    amount: Decimal,
    note: string,
    instrumentId: string | null = null,
    taxWithheld = new Decimal(0),
  ): void => {
    const id = next();
    rows.push({
      id: `demo-${id}`,
      ts,
      type,
      sleeve: null,
      instrumentId,
      quantity: null,
      price: null,
      grossAmount: amount.toFixed(2),
      fees: "0",
      taxWithheld: taxWithheld.toFixed(2),
      currency: "EUR",
      fxToBase: "1",
      account: "demo-broker",
      source: "DEMO",
      externalId: `DEMO-${id}`,
      note,
    });
  };

  const start = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - (MONTHS - 1), 3),
  );

  for (let month = 0; month < MONTHS; month += 1) {
    const day = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + month, 3, 9, 5),
    );
    if (day > anchor) break;

    cash(day, "DEPOSIT", new Decimal(650), "monthly transfer");

    trade(
      day,
      "BUY",
      "IE00DEMO0001",
      SLEEVE_CORE,
      new Decimal(400),
      new Decimal(1),
      "savings plan",
    );
    trade(
      addDays(day, 1),
      "BUY",
      "IE00DEMO0002",
      SLEEVE_CORE,
      new Decimal(100),
      new Decimal(1),
    );

    if (month % 2 === 0) {
      trade(
        addDays(day, 2),
        "BUY",
        "IE00DEMO0005",
        SLEEVE_CORE,
        new Decimal(80),
        new Decimal(1),
      );
    }
    if (month % 3 === 0) {
      trade(
        addDays(day, 4),
        "BUY",
        "BTC",
        SLEEVE_TRADING,
        new Decimal(120),
        new Decimal(0.85),
      );
    }
  }

  const q3 = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 9, 12, 10, 30),
  );
  trade(
    q3,
    "BUY",
    "NL00DEMO0003",
    SLEEVE_TRADING,
    new Decimal(1500),
    new Decimal(1),
  );

  const sell = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 3, 18, 15, 45),
  );
  trade(
    sell,
    "SELL",
    "NL00DEMO0003",
    SLEEVE_TRADING,
    new Decimal(600),
    new Decimal(1),
    "partial sell",
  );

  const bond = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 11, 7, 11, 0),
  );
  rows.push({
    id: "demo-9001",
    ts: bond,
    type: "BUY",
    sleeve: SLEEVE_CORE,
    instrumentId: "LU00DEMO0006",
    quantity: "45.000000",
    price: "22.4000",
    grossAmount: "1008.00",
    fees: "1.00",
    taxWithheld: "0",
    currency: "EUR",
    fxToBase: "1",
    account: "demo-broker",
    source: "DEMO",
    externalId: "DEMO-9001",
    note: "no quote symbol on purpose",
  });

  const dividend = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 5, 22, 8, 0),
  );
  cash(
    dividend,
    "DIVIDEND",
    new Decimal(18.4),
    "quarterly dividend",
    "NL00DEMO0003",
    new Decimal(2.76),
  );

  const custody = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 2, 28, 23, 0),
  );
  cash(custody, "WITHDRAWAL", new Decimal(2.5), "custody fee");

  return rows;
}

const SHARED = [
  { identity: "US00DEMO0101", identityKind: "ISIN", name: "Demo Compute Corp" },
  { identity: "US00DEMO0102", identityKind: "ISIN", name: "Demo Retail Inc" },
  { identity: "DEMOP.DE", identityKind: "TICKER", name: "Demo Pharma AG" },
];

function holdingsFor(
  instrumentId: string,
  count: number,
  asOf: Date,
): {
  instrumentId: string;
  identity: string;
  identityKind: string;
  name: string;
  weight: string;
  asOf: Date;
}[] {
  const random = mulberry32(hashSeed(`holdings:${instrumentId}`));
  const rows = [
    ...SHARED,
    ...Array.from({ length: count - SHARED.length }, (_, i) => ({
      identity: `${instrumentId.slice(-4)}${String(i).padStart(3, "0")}.XX`,
      identityKind: "TICKER",
      name: `Demo Constituent ${instrumentId.slice(-4)}-${String(i).padStart(3, "0")}`,
    })),
  ];

  const raw = rows.map(() => random() + 0.15);
  const total = raw.reduce((sum, value) => sum + value, 0);

  return rows.map((row, i) => ({
    instrumentId,
    identity: row.identity,
    identityKind: row.identityKind,
    name: row.name,
    weight: new Decimal((raw[i] ?? 0) / total)
      .mul(0.965)
      .toDecimalPlaces(6)
      .toFixed(6),
    asOf,
  }));
}

async function main(): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return;
  }

  const target = assertScratchDatabase("seed the demo database");
  const anchor = parseAnchor();
  console.log(
    `Seeding ${target}\n  anchor: ${anchor.toISOString().slice(0, 10)}`,
  );

  await prisma.etfHolding.deleteMany();
  await prisma.priceSnapshot.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.securityIdentity.deleteMany();
  await prisma.instrument.deleteMany();

  await prisma.instrument.createMany({
    data: INSTRUMENTS.map(
      ({
        seedPrice: _seedPrice,
        drift: _drift,
        volatility: _volatility,
        ...row
      }) => row,
    ),
  });

  const from = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - MONTHS, 1),
  );
  const seriesById = new Map(
    INSTRUMENTS.map((i) => [i.id, priceSeries(i, from, anchor)] as const),
  );

  const ledger = buildLedger(anchor, seriesById);
  await prisma.ledgerEntry.createMany({ data: ledger });

  let snapshots = 0;
  for (const [instrumentId, series] of seriesById) {
    if (series.length === 0) continue;
    await prisma.priceSnapshot.createMany({
      data: series.map((point) => ({
        instrumentId,
        price: point.price.toFixed(instrumentId === "BTC" ? 2 : 4),
        currency: "EUR",
        asOf: point.asOf,
        source: "DEMO",
      })),
    });
    snapshots += series.length;
  }

  const holdingsAsOf = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 1, 28),
  );
  const holdings = [
    ...holdingsFor("IE00DEMO0001", 120, holdingsAsOf),
    ...holdingsFor("IE00DEMO0005", 40, holdingsAsOf),
  ];
  await prisma.etfHolding.createMany({ data: holdings });

  await prisma.securityIdentity.createMany({
    data: [
      {
        identity: "US00DEMO0101",
        identityKind: "ISIN",
        canonicalId: "DEMOFIGI000001",
        status: "resolved",
        source: "DEMO",
      },
      {
        identity: "DEMOP.DE",
        identityKind: "TICKER",
        canonicalId: "DEMOFIGI000002",
        status: "resolved",
        source: "DEMO",
      },
      {
        identity: "0001.XX",
        identityKind: "TICKER",
        canonicalId: null,
        status: "not-found",
        source: "DEMO",
      },
    ],
  });

  console.log(
    `  ${INSTRUMENTS.length} instruments, ${ledger.length} ledger entries, ` +
      `${snapshots} price snapshots, ${holdings.length} holdings`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      "\nSeed failed:",
      error instanceof Error ? error.message : error,
    );
    exit(1);
  })
  .finally(() => prisma.$disconnect());
