import Decimal from "decimal.js";

import { Money } from "../domain";
import {
  computeProjection,
  MAX_HORIZON_MONTHS,
  startingValue,
  type ProjectionInput,
} from "./projection";

const CENT = new Decimal("0.01");
const DOUBLINGS = 40;
const BISECTIONS = 40;

function median(input: ProjectionInput): Decimal {
  return new Decimal(computeProjection(input).p50);
}

export function solveContribution(
  input: Omit<ProjectionInput, "monthlyContribution">,
  targetAmount: string,
): string | null {
  const goal = new Decimal(Money.fromString(targetAmount).toString());
  if (goal.isNegative()) {
    throw new Error("A goal cannot be negative.");
  }

  const at = (contribution: Decimal): Decimal =>
    median({ ...input, monthlyContribution: contribution.toFixed(2) });

  let low = new Decimal(0);
  if (at(low).gte(goal)) return "0.00";

  let high = Decimal.max(goal.div(input.horizonMonths), 1);
  let reachable = false;
  for (let i = 0; i < DOUBLINGS; i += 1) {
    if (at(high).gte(goal)) {
      reachable = true;
      break;
    }
    low = high;
    high = high.times(2);
  }
  if (!reachable) return null;

  for (let i = 0; i < BISECTIONS && high.minus(low).gt(CENT); i += 1) {
    const mid = low.plus(high).div(2);
    if (at(mid).gte(goal)) high = mid;
    else low = mid;
  }

  return high.toFixed(2);
}

export function solveHorizon(
  input: Omit<ProjectionInput, "horizonMonths">,
  targetAmount: string,
  maxMonths: number = MAX_HORIZON_MONTHS,
): number | null {
  const goal = new Decimal(Money.fromString(targetAmount).toString());
  if (goal.isNegative()) {
    throw new Error("A goal cannot be negative.");
  }

  if (new Decimal(startingValue(input)).gte(goal)) return 0;
  if (maxMonths < 1) return null;

  const at = (horizonMonths: number): Decimal =>
    median({ ...input, horizonMonths });

  let low = 0;
  let high = Math.min(1, maxMonths);
  while (at(high).lt(goal)) {
    if (high >= maxMonths) return null;
    low = high;
    high = Math.min(high * 2, maxMonths);
  }

  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (at(mid).gte(goal)) high = mid;
    else low = mid;
  }
  return high;
}
