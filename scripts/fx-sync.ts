import "dotenv/config";

import { argv, exit } from "node:process";

import { prisma } from "~/adapters/persistence";
import { currencyCodeSchema } from "~/core/domain";
import { describeFailure } from "~/lib/describe-failure";
import { runFxSync } from "~/lib/fx-sync.server";

import { announceDatabase } from "./lib/db-target";

async function main(): Promise<void> {
  announceDatabase();
  const codes = argv.slice(2);
  for (const code of codes) {
    if (!currencyCodeSchema.safeParse(code).success) {
      console.error(`Not a currency code: ${JSON.stringify(code)}`);
      exit(1);
    }
  }

  const result = await runFxSync(codes.length > 0 ? codes : undefined);

  if (result.outcomes.length === 0) {
    console.log(
      "No currency other than EUR is in use, so there is nothing to sync.\n" +
        "To sync one anyway: pnpm fx:sync USD",
    );
    return;
  }

  for (const outcome of result.outcomes) {
    switch (outcome.status) {
      case "written": {
        const latest = outcome.lastDay
          ? `latest ${outcome.lastDay}`
          : "no rate published";
        console.log(
          `${outcome.quote}: +${outcome.inserted} new, ` +
            `${outcome.unchanged} unchanged (from ${outcome.from}; ${latest})`,
        );
        break;
      }
      case "conflict":
        console.log(
          `${outcome.quote}: not written — rates already stored were revised:`,
        );
        for (const { stored, incoming } of outcome.conflicts) {
          console.log(
            `  ${stored.day}: stored ${stored.rate}, now ${incoming.rate}`,
          );
        }
        break;
      case "unavailable":
        console.log(
          `${outcome.quote}: not answered — ${describeFailure(outcome.error)}`,
        );
        break;
    }
  }

  console.log(`\nStored ${result.inserted} rate(s).`);
  if (result.conflicted.length > 0 || result.unavailable.length > 0) exit(1);
}

main()
  .catch((error: unknown) => {
    console.error("\nFX sync failed:", describeFailure(error));
    exit(1);
  })
  .finally(() => prisma.$disconnect());
