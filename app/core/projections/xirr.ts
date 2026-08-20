export interface CashFlow {
  t: number;
  amount: number;
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const RATE_FLOOR = -0.999999;
const RATE_CEILING = 1e6;

const NEWTON_STEPS = 50;
const BISECTION_STEPS = 200;

const NPV_TOLERANCE = 1e-9;
const RATE_TOLERANCE = 1e-10;

interface Discounted {
  years: readonly number[];
  amounts: readonly number[];
  scale: number;
}

function prepare(flows: readonly CashFlow[]): Discounted {
  const t0 = Math.min(...flows.map((f) => f.t));
  return {
    years: flows.map((f) => (f.t - t0) / YEAR_MS),
    amounts: flows.map((f) => f.amount),
    scale: Math.max(...flows.map((f) => Math.abs(f.amount))),
  };
}

function npv({ years, amounts }: Discounted, rate: number): number {
  let sum = 0;
  for (let i = 0; i < amounts.length; i += 1) {
    sum += amounts[i]! / Math.pow(1 + rate, years[i]!);
  }
  return sum;
}

function dNpv({ years, amounts }: Discounted, rate: number): number {
  let sum = 0;
  for (let i = 0; i < amounts.length; i += 1) {
    const y = years[i]!;
    if (y === 0) continue;
    sum -= (y * amounts[i]!) / Math.pow(1 + rate, y + 1);
  }
  return sum;
}

export function newtonRate(
  flows: readonly CashFlow[],
  guess = 0.1,
): number | null {
  const d = prepare(flows);
  const tolerance = d.scale * NPV_TOLERANCE;
  let rate = guess;

  for (let i = 0; i < NEWTON_STEPS; i += 1) {
    const f = npv(d, rate);
    if (!Number.isFinite(f)) return null;
    if (Math.abs(f) <= tolerance) return rate;

    const slope = dNpv(d, rate);
    if (!Number.isFinite(slope) || slope === 0) return null;

    const next = rate - f / slope;
    if (!Number.isFinite(next) || next <= RATE_FLOOR || next > RATE_CEILING) {
      return null;
    }
    if (Math.abs(next - rate) < RATE_TOLERANCE) {
      return Math.abs(npv(d, next)) <= tolerance ? next : null;
    }
    rate = next;
  }
  return null;
}

function bisectRate(d: Discounted): number | null {
  let lo = RATE_FLOOR;
  let fLo = npv(d, lo);
  if (!Number.isFinite(fLo)) return null;
  if (fLo === 0) return lo;

  let hi = 0.1;
  let fHi = npv(d, hi);
  while (Number.isFinite(fHi) && fLo * fHi > 0 && hi < RATE_CEILING) {
    hi *= 2;
    fHi = npv(d, hi);
  }
  if (!Number.isFinite(fHi)) return null;
  if (fHi === 0) return hi;
  if (fLo * fHi > 0) return null;

  const tolerance = d.scale * NPV_TOLERANCE;
  for (let i = 0; i < BISECTION_STEPS; i += 1) {
    const mid = (lo + hi) / 2;
    const fMid = npv(d, mid);
    if (!Number.isFinite(fMid)) return null;
    if (Math.abs(fMid) <= tolerance || hi - lo < RATE_TOLERANCE) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

export function xirr(flows: readonly CashFlow[], guess = 0.1): number | null {
  if (flows.length < 2) return null;
  if (!flows.every((f) => Number.isFinite(f.amount) && Number.isFinite(f.t))) {
    return null;
  }
  if (!flows.some((f) => f.amount > 0)) return null;
  if (!flows.some((f) => f.amount < 0)) return null;

  return newtonRate(flows, guess) ?? bisectRate(prepare(flows));
}
