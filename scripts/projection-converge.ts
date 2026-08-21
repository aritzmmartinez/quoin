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
const DEFAULT_SEEDS = 8;
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
  min: number;
  max: number;
  median: number;
  spread: number;
}

function spreadOf(values: readonly number[]): Spread {
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? (sorted[mid] ?? 0)
      : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return { min, max, median, spread: median === 0 ? 0 : (max - min) / median };
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
    `\n${SEEDS} seeds per row, from ${DEFAULT_SEED}. Spread is (max − min) / median ` +
      `across those seeds.\n`,
  );
  console.log(
    "      N     ms/run       p10 median      p10 spread       p50 median      p50 spread       p90 median      p90 spread",
  );

  const results = new Map<number, { p10: Spread; p50: Spread; p90: Spread }>();

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

  const worst = (row: { p10: Spread; p50: Spread; p90: Spread }): number =>
    Math.max(row.p10.spread, row.p50.spread, row.p90.spread);

  const ordered = [...results.entries()].sort(([a], [b]) => a - b);
  const enough = ordered.find(([, row]) => worst(row) <= TARGET_SPREAD);

  console.log(
    `\nTarget: every percentile within ${(TARGET_SPREAD * 100).toFixed(1)} % across seeds.`,
  );

  const current = results.get(DEFAULT_SIMULATIONS);
  if (current !== undefined) {
    console.log(
      `Today's default (${DEFAULT_SIMULATIONS}) moves at worst ` +
        `${(worst(current) * 100).toFixed(3)} % between seeds` +
        `${worst(current) <= TARGET_SPREAD ? " — inside the target." : " — outside the target."}`,
    );
  }

  const largest = ordered[ordered.length - 1];
  if (enough === undefined) {
    console.log(
      `No tested N holds the target: the largest tested (${largest?.[0]}) still moves ` +
        `${((largest === undefined ? 0 : worst(largest[1])) * 100).toFixed(3)} %. ` +
        `Extend the grid with --sims= before picking a default.`,
    );
  } else {
    console.log(
      `Smallest tested N inside the target: ${enough[0]}. That is the number to pin as ` +
        `DEFAULT_SIMULATIONS — and the ms/run column is what it costs, multiplied by ~60 ` +
        `on any screen that also solves a goal.`,
    );
  }

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
