import "dotenv/config";

import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { argv, exit } from "node:process";

import { backupDatabase, describeBackup } from "./lib/backup";
import { PROJECT_ROOT, realDatabasePath } from "./lib/db-target";

/**
 * Snapshot the ledger with `VACUUM INTO`, which asks SQLite for a consistent copy
 * rather than trusting a file copy to catch the database between writes.
 *
 * It backs up the LIVE ledger by default and deliberately ignores `DATABASE_URL`:
 * agent sessions run against a scratch database, and a backup command that quietly
 * followed the environment would archive the scratch file and report success.
 *
 */

const USAGE = `Usage:
  pnpm db:backup           snapshot the live ledger (${relative(PROJECT_ROOT, realDatabasePath())})
  pnpm db:backup <FILE>    snapshot another SQLite file

In the Docker image:
  docker exec quoin db-backup
  docker exec quoin db-backup <FILE>`;

function main(): void {
  const [arg] = argv.slice(2);
  if (arg === "--help" || arg === "-h") {
    console.log(USAGE);
    return;
  }

  const source = arg ? resolve(PROJECT_ROOT, arg) : realDatabasePath();
  if (!existsSync(source)) {
    console.error(`No database at ${relative(PROJECT_ROOT, source)}.`);
    exit(1);
  }

  console.log(describeBackup(backupDatabase(source)));
}

try {
  main();
} catch (error: unknown) {
  console.error(
    "\nBackup failed:",
    error instanceof Error ? error.message : error,
  );
  exit(1);
}
