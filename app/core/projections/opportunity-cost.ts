import Decimal from "decimal.js";

import {
  BASE_CURRENCY,
  Money,
  isInKind,
  type LedgerEvent,
  type TradeEvent,
} from "../domain";
import { dayOf } from "../calendar";
import { toBase } from "../fx";
import type { PriceSnapshot } from "../ports";
import { onOrBeforeDay } from "../series";
import type { PriceLike } from "./market-value";
import { xirr, type CashFlow } from "./xirr";

export interface OpportunityCostLine {
  instrumentId: string;
  contributed: string;
  realValue: string;
  benchmarkValue: string;
  difference: string;
}

export interface ExcludedPurchases {
  count: number;
  amount: string;
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
  truncated: (ExcludedPurchases & { firstDay: string }) | null;
  stale: (ExcludedPurchases & { lastDay: string }) | null;
  gaps: ExcludedPurchases | null;
}

export interface OpportunityCostInput {
  events: readonly LedgerEvent[];
  benchmarkInstrumentId: string;
  benchmarkHistory: readonly PriceSnapshot[];
  prices: ReadonlyMap<string, PriceLike>;
  baseCurrency?: string;
  now?: Date;
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

const MAX_CLOSE_AGE_DAYS = 7;

function closeOn(closes: readonly Close[], day: string): Decimal | null {
  return (
    onOrBeforeDay(closes, (close) => close.day, day, MAX_CLOSE_AGE_DAYS)
      ?.price ?? null
  );
}

function isTrade(event: LedgerEvent): event is TradeEvent {
  return event.type === "BUY" || event.type === "SELL";
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

class Exclusions {
  private count = 0;
  private amount = Money.zero();

  add(spent: Money): void {
    this.count += 1;
    this.amount = this.amount.add(spent);
  }

  with<T extends object>(extra: T): (ExcludedPurchases & T) | null {
    if (this.count === 0) return null;
    return { count: this.count, amount: this.amount.toString(), ...extra };
  }
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
  const excluded = {
    truncated: new Exclusions(),
    stale: new Exclusions(),
    gaps: new Exclusions(),
  };

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

    const gross = toBase(trade, "grossAmount");
    const fees = toBase(trade, "fees");
    const t = trade.ts.getTime();

    if (trade.type === "SELL") {
      bucket.quantity = bucket.quantity.minus(trade.quantity);
      const net = gross.subtract(fees);
      bucket.proceeds = bucket.proceeds.add(net);
      bucket.flows.push({ t, amount: net.toNumber() });
      continue;
    }

    bucket.quantity = bucket.quantity.plus(trade.quantity);
    if (isInKind(trade)) continue;
    const spent = gross.add(fees);
    bucket.contributed = bucket.contributed.add(spent);
    bucket.flows.push({ t, amount: spent.negate().toNumber() });

    const day = dayOf(trade.ts);
    const close = closeOn(closes, day);
    if (close === null || close.isZero()) {
      const reason =
        day < firstClose.day
          ? excluded.truncated
          : day > lastClose.day
            ? excluded.stale
            : excluded.gaps;
      reason.add(spent);
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
    truncated: excluded.truncated.with({ firstDay: firstClose.day }),
    stale: excluded.stale.with({ lastDay: lastClose.day }),
    gaps: excluded.gaps.with({}),
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
