import Decimal from "decimal.js";

import {
  BASE_CURRENCY,
  Money,
  type LedgerEvent,
  type TradeEvent,
} from "../domain";
import type { PriceSnapshot } from "../ports";
import type { PriceLike } from "./market-value";
import { xirr, type CashFlow } from "./xirr";

export interface OpportunityCostLine {
  instrumentId: string;
  contributed: string;
  realValue: string;
  benchmarkValue: string;
  difference: string;
}

export interface OpportunityCostTruncation {
  earliestDay: string;
  excludedFlowCount: number;
  excludedAmount: string;
}

export interface OpportunityCostResult {
  realValue: string;
  benchmarkValue: string;
  difference: string;
  realizedProceeds: string;
  realMwr: string | null;
  benchmarkMwr: string | null;
  mwrDifference: string | null;
  lines: OpportunityCostLine[];
  unpricedInstrumentIds: string[];
  truncated: OpportunityCostTruncation | null;
}

export interface OpportunityCostInput {
  events: readonly LedgerEvent[];
  benchmarkInstrumentId: string;
  benchmarkHistory: readonly PriceSnapshot[];
  prices: ReadonlyMap<string, PriceLike>;
  baseCurrency?: string;
  now?: Date;
}

const DAY_IN_MADRID = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dayOf(date: Date): string {
  const parts = DAY_IN_MADRID.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error(`Cannot derive a day from ${date.toISOString()}`);
  }
  return `${year}-${month}-${day}`;
}

interface Close {
  day: string;
  price: Decimal;
}

function closesFrom(
  history: readonly PriceSnapshot[],
  instrumentId: string,
  baseCurrency: string,
): Close[] {
  const byDay = new Map<string, { t: number; price: Decimal }>();
  for (const snapshot of history) {
    if (snapshot.instrumentId !== instrumentId) continue;
    if (snapshot.currency !== baseCurrency) continue;
    const day = dayOf(snapshot.asOf);
    const t = snapshot.asOf.getTime();
    const seen = byDay.get(day);
    if (seen && seen.t > t) continue;
    byDay.set(day, { t, price: new Decimal(snapshot.price) });
  }
  return [...byDay]
    .map(([day, close]) => ({ day, price: close.price }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

function closeOn(closes: readonly Close[], day: string): Decimal | null {
  let lo = 0;
  let hi = closes.length - 1;
  let found: Decimal | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = closes[mid]!;
    if (candidate.day <= day) {
      found = candidate.price;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

function isTrade(event: LedgerEvent): event is TradeEvent {
  return event.type === "BUY" || event.type === "SELL";
}

function baseAmount(value: string, fxToBase: string): Money {
  return Money.fromString(value).scaleBy(fxToBase);
}

interface Bucket {
  instrumentId: string;
  quantity: Decimal;
  contributed: Money;
  proceeds: Money;
  units: Decimal;
  flows: CashFlow[];
  benchmarkFlows: CashFlow[];
}

export function computeOpportunityCost(
  input: OpportunityCostInput,
): OpportunityCostResult {
  const {
    events,
    benchmarkInstrumentId,
    benchmarkHistory,
    prices,
    baseCurrency = BASE_CURRENCY,
    now = new Date(),
  } = input;

  const closes = closesFrom(
    benchmarkHistory,
    benchmarkInstrumentId,
    baseCurrency,
  );
  const firstClose = closes[0];
  const lastClose = closes[closes.length - 1];
  if (!firstClose || !lastClose) {
    throw new Error(
      `No ${baseCurrency} price history for benchmark "${benchmarkInstrumentId}"; ` +
        `backfill it before asking what it would have been worth.`,
    );
  }

  const trades = events
    .filter(isTrade)
    .slice()
    .sort((a, b) => a.ts.getTime() - b.ts.getTime());

  const buckets = new Map<string, Bucket>();
  let excludedFlowCount = 0;
  let excludedAmount = Money.zero();

  for (const trade of trades) {
    let bucket = buckets.get(trade.instrumentId);
    if (!bucket) {
      bucket = {
        instrumentId: trade.instrumentId,
        quantity: new Decimal(0),
        contributed: Money.zero(),
        proceeds: Money.zero(),
        units: new Decimal(0),
        flows: [],
        benchmarkFlows: [],
      };
      buckets.set(trade.instrumentId, bucket);
    }

    const gross = baseAmount(trade.grossAmount, trade.fxToBase);
    const fees = baseAmount(trade.fees, trade.fxToBase);
    const t = trade.ts.getTime();

    if (trade.type === "SELL") {
      bucket.quantity = bucket.quantity.minus(trade.quantity);
      const net = gross.subtract(fees);
      bucket.proceeds = bucket.proceeds.add(net);
      bucket.flows.push({ t, amount: net.toNumber() });
      continue;
    }

    bucket.quantity = bucket.quantity.plus(trade.quantity);
    const spent = gross.add(fees);
    bucket.contributed = bucket.contributed.add(spent);
    bucket.flows.push({ t, amount: spent.negate().toNumber() });

    const close = closeOn(closes, dayOf(trade.ts));
    if (close === null || close.isZero()) {
      excludedFlowCount += 1;
      excludedAmount = excludedAmount.add(spent);
      continue;
    }
    bucket.units = bucket.units.plus(new Decimal(gross.toString()).div(close));
    bucket.benchmarkFlows.push({ t, amount: spent.negate().toNumber() });
  }

  const lines: OpportunityCostLine[] = [];
  const unpricedInstrumentIds: string[] = [];
  let realValue = Money.zero();
  let benchmarkValue = Money.zero();
  let realizedProceeds = Money.zero();
  const realFlows: CashFlow[] = [];
  const benchmarkFlows: CashFlow[] = [];

  for (const bucket of buckets.values()) {
    const price = prices.get(bucket.instrumentId);
    const priced = price !== undefined && price.currency === baseCurrency;

    if (bucket.quantity.gt(0) && !priced) {
      unpricedInstrumentIds.push(bucket.instrumentId);
      continue;
    }

    const held = priced
      ? Money.fromString(price.price).scaleBy(bucket.quantity)
      : Money.zero();
    const real = held.add(bucket.proceeds);
    const benchmark = Money.fromString(
      lastClose.price.times(bucket.units).toFixed(),
    );

    lines.push({
      instrumentId: bucket.instrumentId,
      contributed: bucket.contributed.toString(),
      realValue: real.toString(),
      benchmarkValue: benchmark.toString(),
      difference: real.subtract(benchmark).toString(),
    });

    realValue = realValue.add(real);
    benchmarkValue = benchmarkValue.add(benchmark);
    realizedProceeds = realizedProceeds.add(bucket.proceeds);
    realFlows.push(...bucket.flows);
    benchmarkFlows.push(...bucket.benchmarkFlows);
  }

  lines.sort((a, b) => new Decimal(b.difference).comparedTo(a.difference));

  const realMwr = rateOf(realFlows, realValue, now);
  const benchmarkMwr = rateOf(benchmarkFlows, benchmarkValue, now);

  return {
    realValue: realValue.toString(),
    benchmarkValue: benchmarkValue.toString(),
    difference: realValue.subtract(benchmarkValue).toString(),
    realizedProceeds: realizedProceeds.toString(),
    realMwr,
    benchmarkMwr,
    mwrDifference:
      realMwr === null || benchmarkMwr === null
        ? null
        : new Decimal(realMwr).minus(benchmarkMwr).toFixed(6),
    lines,
    unpricedInstrumentIds: unpricedInstrumentIds.sort(),
    truncated:
      excludedFlowCount === 0
        ? null
        : {
            earliestDay: firstClose.day,
            excludedFlowCount,
            excludedAmount: excludedAmount.toString(),
          },
  };
}

function rateOf(
  flows: readonly CashFlow[],
  terminal: Money,
  now: Date,
): string | null {
  const all = [...flows];
  if (!terminal.isZero()) {
    all.push({ t: now.getTime(), amount: terminal.toNumber() });
  }
  const rate = xirr(all);
  return rate === null ? null : new Decimal(rate).toFixed(6);
}
