import "dotenv/config";

import { writeFileSync } from "node:fs";
import { argv, exit } from "node:process";

import { prisma } from "~/adapters/persistence";
import { exportSync } from "~/lib/sync.server";

import { announceDatabase } from "./lib/db-target";
import { EXCHANGE_SUFFIX } from "./lib/sync-file";

const USAGE = `Usage: pnpm sync:export <file${EXCHANGE_SUFFIX}>

Writes this database's whole user state (ledger, instruments, plans,
compositions, identities, settings) for another device to import with
\`pnpm sync:import\`. Prices, rates and the CPI are not included.

The file holds the portfolio. Its name must end in ${EXCHANGE_SUFFIX}, which
git and the Docker build ignore, and an existing file is never overwritten.`;

async function main(): Promise<void> {
  const [file] = argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!file || !file.endsWith(EXCHANGE_SUFFIX)) {
    console.error(USAGE);
    exit(1);
  }

  announceDatabase();
  const exchange = await exportSync();
  writeFileSync(file, `${JSON.stringify(exchange)}\n`, { flag: "wx" });

  console.log(
    `Exported device ${exchange.deviceId} to ${file}: ${exchange.ledger.length} ledger entries, ` +
      `${exchange.instruments.length} instruments, ${exchange.targets.length} plan versions, ` +
      `${exchange.holdings.length} compositions, ${exchange.identities.length} identities.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    exit(1);
  })
  .finally(() => prisma.$disconnect());
