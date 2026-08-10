import "dotenv/config";

import { argv, exit } from "node:process";

import { assertScratchDatabase } from "./lib/db-target";

/**
 * Refuse the live ledger, then get out of the way.
 *
 * This exists to be the FIRST link of a `&&` chain, because the steps that follow are
 * usually Prisma's own commands and cannot be guarded from the inside. Putting the
 * check in the seed script alone was not enough: `db:seed` runs `prisma migrate deploy`
 * first, so a seed aimed at the wrong database would have migrated the real ledger
 * before anything got to object.
 *
 * Usage: tsx scripts/db-guard.ts "<action>" && <the destructive command>
 */

const action = argv.slice(2).join(" ") || "run this command";

try {
  console.log(`Target: ${assertScratchDatabase(action)}`);
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  exit(1);
}
