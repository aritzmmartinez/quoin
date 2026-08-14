import "dotenv/config";

import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { argv, exit } from "node:process";

import Database from "better-sqlite3";

import { backupFileName, backupsToRemove, KEEP } from "./lib/backup-names";
import { tableCounts, verifyOrDiscard } from "./lib/backup-verify";
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

const BACKUP_DIR = resolve(PROJECT_ROOT, "data/backups");

const USAGE = `Usage:
  pnpm db:backup           snapshot the live ledger (${relative(PROJECT_ROOT, realDatabasePath())})
  pnpm db:backup <FILE>    snapshot another SQLite file`;

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function destinationFor(now: Date): string {
  const base = join(BACKUP_DIR, backupFileName(now));
  if (!existsSync(base)) return base;

  return join(BACKUP_DIR, backupFileName(now, now.getSeconds()));
}

function rotate(): number {
  const doomed = backupsToRemove(readdirSync(BACKUP_DIR));
  for (const file of doomed) unlinkSync(join(BACKUP_DIR, file));
  return doomed.length;
}

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

  mkdirSync(BACKUP_DIR, { recursive: true });
  const destination = destinationFor(new Date());

  const db = new Database(source, { readonly: true, fileMustExist: true });
  let expected: Map<string, number>;
  try {
    db.exec(`VACUUM INTO ${sqlLiteral(destination)}`);
    expected = tableCounts(db);
  } finally {
    db.close();
  }

  verifyOrDiscard(destination, expected);

  const { size } = statSync(destination);
  const rows = [...expected.values()].reduce((sum, n) => sum + n, 0);
  console.log(
    `Backed up ${relative(PROJECT_ROOT, source)} → ` +
      `${relative(PROJECT_ROOT, destination)} (${(size / 1024 / 1024).toFixed(1)} MB)\n` +
      `  verified: integrity_check ok, ${expected.size} tables, ${rows} rows`,
  );

  const removed = rotate();
  if (removed > 0) {
    console.log(`Rotated out ${removed} backup(s) beyond the last ${KEEP}.`);
  }
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
