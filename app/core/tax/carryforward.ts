import Decimal from "decimal.js";

import { taxYearOf, type TaxHistory } from "./tax-lots";

export interface CarryforwardStep {
  year: number;
  ownNet: string;
  consumedFromCarryforward: string;
  finalNet: string;
  pendingLossRemaining: string;
}

/**
 * A year's step in one pool. `crossOffset` is what the other pool's balance
 * of the year moved into it: positive absorbs a loss, negative gives up a
 * gain. `absorbedFromOther` is the other pool's pending losses that this
 * pool's positive balance took; `crossedToOther` is this pool's pending
 * losses that the other took.
 */
export interface PoolStep extends CarryforwardStep {
  crossOffset: string;
  absorbedFromOther: string;
  crossedToOther: string;
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

const ZERO = new Decimal(0);

/** Takes up to `amount` of a pool's pending losses, oldest year first, and returns what it took. */
function consumePending(pool: Pool, amount: Decimal): Decimal {
  let consumed = ZERO;
  for (const loss of pool.pending) {
    const left = amount.minus(consumed);
    if (left.lte(0)) break;
    const applied = Decimal.min(loss.remaining, left);
    loss.remaining = loss.remaining.minus(applied);
    consumed = consumed.plus(applied);
  }
  return consumed;
}

function pendingOf(pool: Pool): Decimal {
  return pool.pending.reduce((sum, loss) => sum.plus(loss.remaining), ZERO);
}

/**
 * A year's negative balance in one pool offsets the other's positive balance
 * of that same year, up to `limit` of it.
 */
function crossOffsets(
  a: Decimal,
  b: Decimal,
  limit: Decimal,
): [Decimal, Decimal] {
  if (a.lt(0) && b.gt(0)) {
    const x = Decimal.min(a.abs(), b.times(limit));
    return [x, x.neg()];
  }
  if (b.lt(0) && a.gt(0)) {
    const x = Decimal.min(b.abs(), a.times(limit));
    return [x.neg(), x];
  }
  return [ZERO, ZERO];
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
  return carryforwardPools([netOf, () => ZERO], year, years, "0").pools[0];
}

/**
 * Two pools advancing year by year together, because what one absorbs from
 * the other is no longer a loss it carries. Each year:
 *
 * 1. A pool's negative balance offsets the other's positive one, up to
 *    `limit` of that positive balance.
 * 2. Each positive remainder consumes its own pool's pending losses, oldest
 *    first, without limit.
 * 3. Pending losses still left in one pool offset what remains positive in
 *    the other, oldest first, up to what the limit has left after step 1: the
 *    limit is one per year and receiving pool, over its own positive balance.
 *
 * Only earlier years' losses are pending in step 3; the year's own negative
 * balance joins them after it. At most one direction applies in step 3: a
 * pool still positive after step 2 has no pending loss left. The savings base
 * is the sum of the positive final balances.
 */
export function carryforwardPools(
  netsOf: readonly [NetOf, NetOf],
  year: number,
  years: number,
  crossOffsetLimit: string,
): PoolsResult {
  const limit = new Decimal(crossOffsetLimit);
  const pair: [Pool, Pool] = [
    { pending: [], steps: [] },
    { pending: [], steps: [] },
  ];
  for (let y = year - years; y <= year; y++) {
    const own = [netsOf[0](y), netsOf[1](y)];
    const cross = crossOffsets(own[0]!, own[1]!, limit);
    const after = own.map((net, i) => net.plus(cross[i]!));
    const consumed = pair.map((pool, i) =>
      after[i]!.gt(0) ? consumePending(pool, after[i]!) : ZERO,
    );
    const absorbed = pair.map((_, i) => {
      const other = pair[1 - i]!;
      const room = limit
        .times(Decimal.max(own[i]!, 0))
        .minus(Decimal.max(cross[1 - i]!, 0));
      const rest = after[i]!.minus(consumed[i]!);
      return rest.gt(0) && room.gt(0)
        ? consumePending(other, Decimal.min(rest, room))
        : ZERO;
    });

    pair.forEach((pool, i) => {
      const finalNet = after[i]!.minus(consumed[i]!).minus(absorbed[i]!);
      if (finalNet.lt(0)) {
        pool.pending.push({ year: y, remaining: finalNet.abs() });
      }
      pool.steps.push({
        year: y,
        ownNet: own[i]!.toFixed(),
        crossOffset: cross[i]!.toFixed(),
        consumedFromCarryforward: consumed[i]!.toFixed(),
        absorbedFromOther: absorbed[i]!.toFixed(),
        crossedToOther: absorbed[1 - i]!.toFixed(),
        finalNet: finalNet.toFixed(),
        pendingLossRemaining: pendingOf(pool).toFixed(),
      });
    });
  }
  const pools: [PoolResult, PoolResult] = pair.map((pool) => ({
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
 * The capital-gains pool's net of a year is its computable net: the deferred
 * losses that compute in it are already inside, so a year that ends negative
 * because of one starts that loss's window in that year, not in the year of
 * the sale that deferred it.
 */
export function gainsNetOf(history: TaxHistory): NetOf {
  return (y) => new Decimal(taxYearOf(history, y).computableNet);
}
