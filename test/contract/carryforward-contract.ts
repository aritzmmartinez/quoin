import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import Decimal from "decimal.js";

import {
  carryforwardPool,
  carryforwardPools,
  type NetOf,
} from "../../app/core/tax";

import { contractJson } from "./build";

type Nets = Record<string, string>;

export interface CarryforwardInput {
  name: string;
  targetYear: number;
  years: number;
  crossOffsetLimit?: string;
  pools: Nets[];
}

const cases: (CarryforwardInput & {
  byHand?: { arithmetic: string; figures: Record<string, string | null> };
})[] = [
  {
    name: "One pool: a negative net carried and absorbed by the years after it",
    targetYear: 2026,
    years: 4,
    pools: [{ "2023": "-300", "2024": "100", "2025": "50", "2026": "400" }],
    byHand: {
      arithmetic:
        "Window 2022–2026. 2023 leaves 300 pending; 2024 takes 100 (200 left), 2025 takes 50 (150 left), 2026 takes the 150 left: 400 − 150 = 250.",
      figures: {
        "steps.2.pendingLossRemaining": "200",
        "steps.3.finalNet": "0",
        "steps.4.consumedFromCarryforward": "150",
        finalNet: "250",
      },
    },
  },
  {
    name: "One pool: a loss still inside its window offsets a later gain",
    targetYear: 2026,
    years: 4,
    pools: [{ "2022": "-500", "2023": "200", "2026": "400" }],
    byHand: {
      arithmetic:
        "Window 2022–2026. 2022 leaves 500 pending, 2023 takes 200 (300 left), 2026 takes the 300: 400 − 300 = 100.",
      figures: {
        "steps.1.pendingLossRemaining": "300",
        finalNet: "100",
      },
    },
  },
  {
    name: "One pool: the same loss has expired once the window has passed it",
    targetYear: 2027,
    years: 4,
    pools: [{ "2022": "-500", "2023": "200", "2026": "400", "2027": "400" }],
    byHand: {
      arithmetic:
        "Window 2023–2027: the 2022 loss is outside it, so the 300 it had left is gone. Nothing is pending and 2027 keeps its 400.",
      figures: {
        "steps.0.finalNet": "200",
        "steps.4.pendingLossRemaining": "0",
        finalNet: "400",
      },
    },
  },
  {
    name: "Two pools with a cross limit of 0: each carries its own loss and the base adds the positive ones",
    targetYear: 2026,
    years: 4,
    crossOffsetLimit: "0",
    pools: [
      { "2025": "200", "2026": "-1000" },
      { "2025": "-50", "2026": "300" },
    ],
    byHand: {
      arithmetic:
        "Gains: 2025 +200, 2026 −1000 pending. Income: 2025 −50 pending, 2026 300 − 50 = 250. Nothing crosses. Base: 0 (gains are negative) + 250 = 250.",
      figures: {
        "pools.0.finalNet": "-1000",
        "pools.1.steps.4.consumedFromCarryforward": "50",
        "pools.1.finalNet": "250",
        savingsBase: "250",
      },
    },
  },
  {
    name: "Two pools with a cross limit of 0.25: a year's negative pool takes up to a quarter of the other",
    targetYear: 2026,
    years: 4,
    crossOffsetLimit: "0.25",
    pools: [
      { "2025": "200", "2026": "-1000" },
      { "2025": "-50", "2026": "300" },
    ],
    byHand: {
      arithmetic:
        "2025: income −50 takes min(50, 200 × 0.25 = 50) = 50 from gains, which keep 150; nothing is pending. 2026: gains −1000 take min(1000, 300 × 0.25 = 75) = 75 from income: gains carry −925, income keeps 225. Base: 0 + 225 = 225.",
      figures: {
        "pools.0.steps.3.finalNet": "150",
        "pools.1.steps.3.finalNet": "0",
        "pools.0.steps.4.crossOffset": "75",
        "pools.0.finalNet": "-925",
        "pools.1.finalNet": "225",
        savingsBase: "225",
      },
    },
  },
];

function netOf(nets: Nets): NetOf {
  return (year) => new Decimal(nets[String(year)] ?? "0");
}

export function evaluate(input: CarryforwardInput) {
  const [first, second] = input.pools;
  if (first === undefined) throw new Error(`${input.name}: no pool`);
  if (second === undefined) {
    return carryforwardPool(netOf(first), input.targetYear, input.years);
  }
  return carryforwardPools(
    [netOf(first), netOf(second)],
    input.targetYear,
    input.years,
    input.crossOffsetLimit ?? "0",
  );
}

export const CARRYFORWARD_CONTRACT_FILE = fileURLToPath(
  new URL("./carryforward.json", import.meta.url),
);

export function carryforwardContractJson(): string {
  return contractJson(
    "carryforward",
    "The generic carryforward of one savings pool (carryforwardPool) and of two pools advancing together (carryforwardPools), as pure functions over each year's own net. pools holds one or two maps from year to that year's own net; a year missing is 0. The window is targetYear − years through targetYear: a loss older than that has expired and is never seen. Each year, in order: with two pools, a negative own net offsets the other pool's positive own net of the same year up to crossOffsetLimit of it (crossOffset: positive in the pool that absorbs, negative in the one that gives); then a positive remainder consumes pending losses oldest year first, and a negative one becomes that year's pending loss. finalNet is the last year's balance after both; savingsBase adds the two pools' finalNet where positive. Bizkaia's limit is 0; 0.25 is passed as a parameter only to pin the crossing. Amounts are decimal strings. Shared with the mobile client: both implementations must reproduce every case. expect is written by running the TypeScript core; byHand.figures, where a case has it, are worked out by hand, its arithmetic says how, and each key is a dotted path into expect.",
    cases.map(({ byHand, ...input }) => ({
      ...input,
      ...(byHand ? { byHand } : {}),
      expect: evaluate(input),
    })),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(CARRYFORWARD_CONTRACT_FILE, carryforwardContractJson());
}
