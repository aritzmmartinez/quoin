import Decimal from "decimal.js";

import { Money } from "../domain";

export interface RebalanceLine {
  instrumentId: string;
  currentValue: string;
  targetWeight: string;
}

export interface RebalanceInput {
  contribution: string;
  lines: readonly RebalanceLine[];
}

export interface RebalanceAllocation {
  instrumentId: string;
  amount: string;
  driftBefore: string;
  driftAfter: string;
}

export interface RebalanceResult {
  allocations: RebalanceAllocation[];
  totalDriftBefore: string;
  totalDriftAfter: string;
}

const ZERO = new Decimal(0);
const DRIFT_DP = 6;
const CENTS = 2;

export function computeRebalance(input: RebalanceInput): RebalanceResult {
  const contribution = Money.fromString(input.contribution);
  if (contribution.isNegative()) {
    throw new Error("A rebalance contribution cannot be negative.");
  }
  if (input.lines.length === 0) {
    return { allocations: [], totalDriftBefore: "0", totalDriftAfter: "0" };
  }

  const totalWeight = input.lines.reduce((sum, line) => {
    const weight = new Decimal(line.targetWeight);
    if (weight.isNegative()) {
      throw new Error(`Negative target weight for ${line.instrumentId}.`);
    }
    return sum.plus(weight);
  }, ZERO);
  if (!totalWeight.gt(0)) {
    throw new Error("A plan whose weights sum to zero targets nothing.");
  }

  const lines = input.lines.map((line) => ({
    instrumentId: line.instrumentId,
    value: Money.fromString(line.currentValue),
    weight: new Decimal(line.targetWeight).div(totalWeight),
  }));

  const totalValue = lines.reduce((sum, l) => sum.add(l.value), Money.zero());
  const base = totalValue.add(contribution);

  const deficits = lines.map((line) => {
    const gap = base.scaleBy(line.weight).subtract(line.value);
    return gap.isNegative() ? Money.zero() : gap;
  });
  const totalDeficit = deficits.reduce((sum, d) => sum.add(d), Money.zero());

  const amounts = totalDeficit.isZero()
    ? lines.map(() => Money.zero())
    : settle(
        deficits.map((deficit) =>
          contribution.scaleBy(toDecimal(deficit).div(toDecimal(totalDeficit))),
        ),
        contribution,
      );

  const allocations = lines.map((line, index) => {
    const amount = amounts[index] ?? Money.zero();
    return {
      instrumentId: line.instrumentId,
      amount: amount.toString(),
      driftBefore: drift(line.value, totalValue, line.weight).toFixed(DRIFT_DP),
      driftAfter: drift(line.value.add(amount), base, line.weight).toFixed(
        DRIFT_DP,
      ),
    };
  });

  return {
    allocations,
    totalDriftBefore: sumDrift(allocations, "driftBefore"),
    totalDriftAfter: sumDrift(allocations, "driftAfter"),
  };
}

function toDecimal(money: Money): Decimal {
  return new Decimal(money.toString());
}

function settle(raw: readonly Money[], contribution: Money): Money[] {
  const rounded = raw.map((amount) =>
    Money.fromString(toDecimal(amount).toFixed(CENTS)),
  );
  const remainder = contribution.subtract(
    rounded.reduce((sum, amount) => sum.add(amount), Money.zero()),
  );
  if (remainder.isZero()) return rounded;

  const largest = rounded.reduce((best, amount, index, all) => {
    const current = all[best];
    return current !== undefined && amount.compare(current) > 0 ? index : best;
  }, 0);
  return rounded.map((amount, index) =>
    index === largest ? amount.add(remainder) : amount,
  );
}

function drift(value: Money, total: Money, weight: Decimal): Decimal {
  const share = total.isZero() ? ZERO : toDecimal(value).div(toDecimal(total));
  return share.minus(weight).abs();
}

function sumDrift(
  allocations: readonly RebalanceAllocation[],
  field: "driftBefore" | "driftAfter",
): string {
  return allocations
    .reduce((sum, a) => sum.plus(new Decimal(a[field])), ZERO)
    .toFixed(DRIFT_DP);
}
