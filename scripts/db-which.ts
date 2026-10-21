import "dotenv/config";

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { argv, execPath, exit } from "node:process";

import { backupDatabase, describeBackup } from "./lib/backup";
import {
  announceDatabase,
  PROJECT_ROOT,
  realDatabasePath,
} from "./lib/db-target";
import {
  migrateDevRefusal,
  shouldBackupBeforeDeploy,
} from "./lib/migrate-guard";

const PRISMA_CLI = resolve(PROJECT_ROOT, "node_modules/prisma/build/index.js");

function migrateStatus(): number | null {
  const result = spawnSync(execPath, [PRISMA_CLI, "migrate", "status"], {
    cwd: PROJECT_ROOT,
    stdio: "ignore",
  });
  return result.error ? null : result.status;
}

function main(): void {
  const [mode] = argv.slice(2);
  const target = announceDatabase();

  if (mode === "migrate") {
    const refusal = migrateDevRefusal(target);
    if (refusal !== null) {
      console.error(refusal);
      exit(1);
    }
    return;
  }

  if (mode === "deploy") {
    const exists = existsSync(realDatabasePath());
    const status =
      target.kind === "ledger" && exists ? migrateStatus() : 0;
    if (!shouldBackupBeforeDeploy(target, exists, status)) return;

    console.error("Pending migrations: backing up the ledger first.");
    console.error(describeBackup(backupDatabase(realDatabasePath())));
  }
}

try {
  main();
} catch (error: unknown) {
  console.error(
    "\nBackup failed, nothing was migrated:",
    error instanceof Error ? error.message : error,
  );
  exit(1);
}
