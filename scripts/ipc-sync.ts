import "dotenv/config";

import { argv, exit } from "node:process";

import { IneInflationProvider } from "~/adapters/inflation";
import { PrismaInflationRepository, prisma } from "~/adapters/persistence";
import { runInflationSync } from "~/lib/ipc-sync.server";

const FORCE_REBASE = "--force-rebase";

async function main(): Promise<void> {
  const force = argv.includes(FORCE_REBASE);

  const result = await runInflationSync();

  for (const outcome of result.outcomes) {
    if (outcome.status === "written") {
      console.log(
        `${outcome.series}: ${outcome.monthCount} month(s) on base ${outcome.base} ` +
          `(+${outcome.added} new)`,
      );
      if (outcome.gaps.length > 0) {
        console.log(
          `  gaps in the published series: ${outcome.gaps.join(", ")}`,
        );
      }
    } else {
      console.log(
        `${outcome.series}: not written — INE now publishes base ${outcome.incomingBase}, ` +
          `stored base ${outcome.storedBases.join("/")} (${outcome.storedCount} months)`,
      );
    }
  }

  console.log(`\nStored ${result.written} index level(s).`);

  if (result.rebaseBlocked.length === 0) return;

  if (!force) {
    console.error(
      "\nRebase detected. Nothing was written for the series above.\n" +
        "INE has republished them against a new reference year, so the stored\n" +
        "levels and the incoming ones mean different things. Mixing the two would\n" +
        "corrupt every deflation ratio that spans the boundary — silently, and in\n" +
        "the direction that looks like a gain.\n\n" +
        `What to do: replace the affected series wholesale, at the new base:\n\n  pnpm ipc:sync ${FORCE_REBASE}\n\n` +
        "That deletes the stored levels for every rebased series and re-imports\n" +
        "the full history from INE. Nothing else in Quoin references them, so the\n" +
        "only thing lost is numbers that can be fetched again.",
    );
    exit(1);
  }

  const repository = new PrismaInflationRepository();
  const provider = new IneInflationProvider();
  for (const series of result.rebaseBlocked) {
    await repository.deleteSeries(series);
    const incoming = await provider.getSeries(series);
    const count = await repository.saveMany(incoming);
    await repository.markChecked(series);
    console.log(
      `${series}: series replaced at the new base — ${count} month(s) re-imported`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(
      "\nIPC sync failed:",
      error instanceof Error ? error.message : error,
    );
    exit(1);
  })
  .finally(() => prisma.$disconnect());
