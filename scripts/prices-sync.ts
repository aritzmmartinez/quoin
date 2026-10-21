import "dotenv/config";

import { exit } from "node:process";

import { prisma } from "~/adapters/persistence";
import { inTurn } from "~/lib/in-turn";
import {
  failedSync,
  syncInstrumentPrices,
  syncProblemOf,
} from "~/lib/prices-sync";
import { defaultDeps, syncTargets } from "~/lib/prices-sync.server";

import { announceDatabase } from "./lib/db-target";

async function main(): Promise<void> {
  announceDatabase();
  const { targets, unmapped } = await syncTargets();

  console.log(
    `Instruments: ${targets.length + unmapped.length} | mapped: ${targets.length} | unmapped: ${unmapped.length}`,
  );

  if (unmapped.length > 0) {
    console.log(
      "\nNo quote symbol yet (set one with `pnpm prices:map <ISIN> <SYMBOL>`):",
    );
    for (const i of unmapped) console.log(`  ${i.instrumentId}  ${i.name}`);
  }
  if (targets.length === 0) {
    console.log("\nNothing to sync.");
    return;
  }

  console.log("");
  const deps = defaultDeps();
  const steps = await inTurn(
    targets,
    (target) => syncInstrumentPrices(deps, target),
    {
      onError: (error, target) => {
        console.error(
          `  ${target.id}  failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        return failedSync(target, syncProblemOf(error));
      },
      onEach: (step, index) => {
        const symbol = targets[index]?.quoteSymbol ?? "?";
        const live = step.live ? "live quote" : "no live quote";
        const problem = step.problem ? `  [${step.problem}]` : "";
        console.log(
          `  ${step.instrumentId}  (${symbol})  ${step.inserted} new, ${step.corrected} corrected, ${live}${problem}`,
        );
      },
    },
  );

  const failed = steps.filter((s) => s.problem !== null);
  console.log(
    `\nUpdated ${steps.length - failed.length} of ${steps.length}; ${steps.reduce((n, s) => n + s.inserted, 0)} daily close(s) recovered, ${steps.reduce((n, s) => n + s.corrected, 0)} corrected.`,
  );
  if (failed.length > 0) {
    console.log("\nCould not update:");
    for (const f of failed)
      console.log(`  ${f.instrumentId}  ${f.name}: ${f.problem}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(
      "\nPrice sync failed:",
      error instanceof Error ? error.message : error,
    );
    exit(1);
  })
  .finally(() => prisma.$disconnect());
