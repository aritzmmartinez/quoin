import "dotenv/config";

import Decimal from "decimal.js";

import { prisma } from "~/adapters/persistence";
import {
  computeProjection,
  DEFAULT_SEED,
  DEFAULT_SIMULATIONS,
  projectionWindow,
} from "~/core/projections";
import { MIN_WINDOW_MONTHS } from "~/lib/projection";
import { loadProjectionContext } from "~/lib/projection.server";

import { databasePath } from "./lib/db-target";

const TARGET_SPREAD = 0.01;

const DEFAULT_SIMS = [1000, 3000, 10000, 30000];
const DEFAULT_SEEDS = 24;
const DEFAULT_HORIZON_MONTHS = 240;

function flag(name: string): string | undefined {
  return process.argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

function numberFlag(name: string, fallback: number): number {
  const raw = flag(name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${name}=${raw} is not a whole number of at least 1.`);
  }
  return parsed;
}

const HORIZON_MONTHS = numberFlag("horizon", DEFAULT_HORIZON_MONTHS);
const SEEDS = numberFlag("seeds", DEFAULT_SEEDS);
const SIMS = (flag("sims") ?? DEFAULT_SIMS.join(",")).split(",").map((part) => {
  const parsed = Number(part.trim());
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--sims: "${part}" is not a whole number of at least 1.`);
  }
  return parsed;
});

interface Spread {
  median: number;
  spread: number;
}

const KEYS = ["p10", "p50", "p90"] as const;
type Key = (typeof KEYS)[number];
type Row = Record<Key, Spread>;

const N_LIMITED_EXPONENT = -0.5;
const EXPONENT_TOLERANCE = 0.2;
const MIN_GRID = 3;
const MIN_SEEDS_TO_JUDGE = 16;

function exponentOf(
  key: Key,
  ordered: readonly [number, Row][],
): number | null {
  const points = ordered.filter(([, row]) => row[key].spread > 0);
  if (points.length < MIN_GRID) return null;

  const xs = points.map(([n]) => Math.log(n));
  const ys = points.map(([, row]) => Math.log(row[key].spread));
  const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / ys.length;

  let covariance = 0;
  let variance = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const dx = (xs[i] ?? 0) - meanX;
    covariance += dx * ((ys[i] ?? 0) - meanY);
    variance += dx * dx;
  }
  return variance === 0 ? null : covariance / variance;
}

function plateau(key: Key, ordered: readonly [number, Row][]): string {
  const slope = exponentOf(key, ordered);
  if (slope === null) return "";

  const shape = ` — spread falls as N^${slope.toFixed(2)}`;
  if (SEEDS < MIN_SEEDS_TO_JUDGE) return `${shape} (too few seeds to judge)`;
  if (slope <= N_LIMITED_EXPONENT + EXPONENT_TOLERANCE) return shape;

  return (
    `${shape}, slower than the N^${N_LIMITED_EXPONENT.toFixed(2)} of an estimate that ` +
    `only wants more draws, so this one is window-limited, not N-limited`
  );
}

function spreadOf(values: readonly number[]): Spread {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? (sorted[mid] ?? 0)
      : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;

  if (values.length < 2 || median === 0) return { median, spread: 0 };

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);

  return { median, spread: Math.sqrt(variance) / median };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(3).padStart(8)} %`;
}

function eur(value: number): string {
  return new Decimal(value).toFixed(0).padStart(14);
}

async function main(): Promise<void> {
  console.log(`Database: ${databasePath() ?? "(unset)"}\n`);

  const { plan } = await loadProjectionContext();
  if (plan === null) {
    console.log(
      "No target in force, so there is no plan to converge. Record one with pnpm target:set.",
    );
    return;
  }
  if (plan.source.lines.length === 0) {
    console.log(
      "No planned line has price history, so there is nothing to resample. Run pnpm prices:backfill.",
    );
    return;
  }

  const window = projectionWindow(plan.source.lines);
  if (window.windowMonths === 0) {
    console.log(
      "The planned lines share no month of history, so there is no window to resample.",
    );
    return;
  }

  const contribution = flag("contribution") ?? plan.defaultContribution;

  console.log(
    `Window: ${window.windowMonths} months` +
      `  |  limited by ${plan.nameOf(window.limitingInstrumentId)}` +
      `  |  planned lines: ${plan.source.lines.length}` +
      `  |  off-plan lines: ${plan.source.heldLines.length}`,
  );
  console.log(
    `Horizon: ${HORIZON_MONTHS} months  |  contribution: ${contribution}` +
      `  |  starting value: ${plan.input.plannedValue ?? "0"}`,
  );
  if (window.windowMonths < MIN_WINDOW_MONTHS) {
    console.log(
      `\nNote: the screen refuses below ${MIN_WINDOW_MONTHS} months and this window is ` +
        `${window.windowMonths}. The convergence question is still answerable — it is about ` +
        `how many draws a distribution needs, not about whether the distribution is worth ` +
        `trusting — but a default measured here is measured on a window the screen would ` +
        `not print.`,
    );
  }

  console.log(
    `\n${SEEDS} seeds per row, from ${DEFAULT_SEED}. Spread is one standard deviation ` +
      `across those seeds as a share of the median — a range would grow with the seed ` +
      `count and say nothing.\n`,
  );
  console.log(
    "      N     ms/run       p10 median      p10 spread       p50 median      p50 spread       p90 median      p90 spread",
  );

  const results = new Map<number, Row>();

  for (const simulations of SIMS) {
    const p10: number[] = [];
    const p50: number[] = [];
    const p90: number[] = [];

    const started = Date.now();
    for (let s = 0; s < SEEDS; s += 1) {
      const result = computeProjection({
        ...plan.input,
        horizonMonths: HORIZON_MONTHS,
        monthlyContribution: contribution,
        simulations,
        seed: DEFAULT_SEED + s,
      });
      p10.push(Number(result.p10));
      p50.push(Number(result.p50));
      p90.push(Number(result.p90));
    }
    const perRun = (Date.now() - started) / SEEDS;

    const row = { p10: spreadOf(p10), p50: spreadOf(p50), p90: spreadOf(p90) };
    results.set(simulations, row);

    console.log(
      `${String(simulations).padStart(7)}  ${perRun.toFixed(1).padStart(9)}` +
        `  ${eur(row.p10.median)}  ${pct(row.p10.spread)}` +
        `  ${eur(row.p50.median)}  ${pct(row.p50.spread)}` +
        `  ${eur(row.p90.median)}  ${pct(row.p90.spread)}`,
    );
  }

  const ordered = [...results.entries()].sort(([a], [b]) => a - b);
  const largest = ordered[ordered.length - 1];

  console.log(
    `\nTarget: ${(TARGET_SPREAD * 100).toFixed(1)} % across seeds, judged per percentile — ` +
      `a single worst-of-three verdict hides which one is the problem.\n`,
  );

  for (const key of KEYS) {
    const clears = ordered.find(([, row]) => row[key].spread <= TARGET_SPREAD);
    const best = largest === undefined ? 0 : largest[1][key].spread;
    const verdict =
      clears === undefined
        ? `no tested N clears it, best ${pct(best).trim()} at ${largest?.[0]}`
        : `clears at ${clears[0]}`;
    console.log(`  ${key}  ${verdict}${plateau(key, ordered)}`);
  }

  const current = results.get(DEFAULT_SIMULATIONS);
  if (current !== undefined) {
    console.log(
      `\nToday's default (${DEFAULT_SIMULATIONS}): ` +
        KEYS.map((key) => `${key} ${pct(current[key].spread).trim()}`).join(
          "  |  ",
        ),
    );
  }
  console.log(
    `Cost of raising it is the ms/run column, multiplied by ~60 on any screen that also ` +
      `solves a goal.`,
  );

  console.log(
    "\nConvergence is not accuracy. A tight spread says the figure no longer depends on " +
      "which seed was drawn; it says nothing about whether resampling this window " +
      "describes the next twenty years.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
