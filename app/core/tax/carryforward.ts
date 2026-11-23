import Decimal from "decimal.js";

import type { LedgerEvent } from "../domain";

import { territoryRules } from "./territory";
import {
  computeTaxHistory,
  taxYearOf,
  type TaxHistory,
  type TaxOptions,
} from "./tax-lots";

export interface CarryforwardStep {
  year: number;
  ownNet: string;
  consumedFromCarryforward: string;
  finalNet: string;
  pendingLossRemaining: string;
}

export interface CarryforwardResult {
  targetYear: number;
  steps: CarryforwardStep[];
  netSavingsBase: string;
}

/** A year's step in one pool. `crossOffset` is what the other pool moved into it: positive absorbs a loss, negative gives up a gain. */
export interface PoolStep extends CarryforwardStep {
  crossOffset: string;
}

export interface PoolResult {
  steps: PoolStep[];
  finalNet: string;
}

export interface PoolsResult {
  targetYear: number;
  pools: [PoolResult, PoolResult];
  savingsBase: string;
}

export type NetOf = (year: number) => Decimal;

interface Pool {
  pending: { year: number; remaining: Decimal }[];
  steps: PoolStep[];
}

/**
 * One year of one pool: the cross offset applies first, then a positive
 * remainder consumes pending losses oldest first, and a negative one becomes
 * a pending loss of that year.
 */
function settle(pool: Pool, year: number, ownNet: Decimal, cross: Decimal) {
  const afterCross = ownNet.plus(cross);
  let consumed = new Decimal(0);

  if (afterCross.lt(0)) {
    pool.pending.push({ year, remaining: afterCross.abs() });
  } else if (afterCross.gt(0)) {
    let remaining = afterCross;
    for (const loss of pool.pending) {
      if (remaining.lte(0)) break;
      if (loss.remaining.lte(0)) continue;
      const applied = Decimal.min(loss.remaining, remaining);
      loss.remaining = loss.remaining.minus(applied);
      remaining = remaining.minus(applied);
      consumed = consumed.plus(applied);
    }
  }

  pool.steps.push({
    year,
    ownNet: ownNet.toFixed(),
    crossOffset: cross.toFixed(),
    consumedFromCarryforward: consumed.toFixed(),
    finalNet: afterCross.minus(consumed).toFixed(),
    pendingLossRemaining: pool.pending
      .reduce((sum, loss) => sum.plus(loss.remaining), new Decimal(0))
      .toFixed(),
  });
}

/**
 * A year's negative balance in one pool offsets the other's positive balance
 * of that same year, up to `limit` of it.
 * ponytail: only same-year balances cross; régimen común also crosses pending
 * losses from earlier years, add it with that territory.
 */
function crossOffsets(a: Decimal, b: Decimal, limit: Decimal): [Decimal, Decimal] {
  if (a.lt(0) && b.gt(0)) {
    const x = Decimal.min(a.abs(), b.times(limit));
    return [x, x.neg()];
  }
  if (b.lt(0) && a.gt(0)) {
    const x = Decimal.min(b.abs(), a.times(limit));
    return [x.neg(), x];
  }
  return [new Decimal(0), new Decimal(0)];
}

/**
 * Nothing here is stored. Every call recomputes targetYear-years..targetYear,
 * and restricting the window that way enforces the expiry of a pending loss
 * without tracking it separately: a loss can offset any year up to `years`
 * after the one it originated in.
 */
export function carryforwardPool(
  netOf: NetOf,
  year: number,
  years: number,
): PoolResult {
  const pool: Pool = { pending: [], steps: [] };
  for (let y = year - years; y <= year; y++) {
    settle(pool, y, netOf(y), new Decimal(0));
  }
  return { steps: pool.steps, finalNet: pool.steps[pool.steps.length - 1]!.finalNet };
}

/**
 * Two pools advancing year by year together, because what one absorbs from
 * the other in a year is no longer a loss it carries. The savings base is the
 * sum of their positive final balances.
 */
export function carryforwardPools(
  netsOf: readonly [NetOf, NetOf],
  year: number,
  years: number,
  crossOffsetLimit: string,
): PoolsResult {
  const limit = new Decimal(crossOffsetLimit);
  const a: Pool = { pending: [], steps: [] };
  const b: Pool = { pending: [], steps: [] };
  for (let y = year - years; y <= year; y++) {
    const netA = netsOf[0](y);
    const netB = netsOf[1](y);
    const [crossA, crossB] = crossOffsets(netA, netB, limit);
    settle(a, y, netA, crossA);
    settle(b, y, netB, crossB);
  }
  const pools: [PoolResult, PoolResult] = [a, b].map((pool) => ({
    steps: pool.steps,
    finalNet: pool.steps[pool.steps.length - 1]!.finalNet,
  })) as [PoolResult, PoolResult];
  return {
    targetYear: year,
    pools,
    savingsBase: pools
      .reduce((sum, pool) => sum.plus(Decimal.max(pool.finalNet, 0)), new Decimal(0))
      .toFixed(),
  };
}

/**
 * The capital-gains pool alone. A year's own net is its computable net: the
 * deferred losses that compute in it are already inside, so a year that ends
 * negative because of one starts that loss's window in that year, not in the
 * year of the sale that deferred it.
 */
export function computeNetWithCarryforward(
  events: readonly LedgerEvent[],
  year: number,
  options: TaxOptions,
): CarryforwardResult {
  return carryforwardFrom(computeTaxHistory(events, options), year);
}

export function carryforwardFrom(
  history: TaxHistory,
  year: number,
): CarryforwardResult {
  const { steps, finalNet } = carryforwardPool(
    gainsNetOf(history),
    year,
    territoryRules(history.territory).lossCarryforwardYears,
  );
  return {
    targetYear: year,
    steps: steps.map(({ crossOffset: _, ...step }) => step),
    netSavingsBase: finalNet,
  };
}

export function gainsNetOf(history: TaxHistory): NetOf {
  return (y) => new Decimal(taxYearOf(history, y).computableNet);
}
