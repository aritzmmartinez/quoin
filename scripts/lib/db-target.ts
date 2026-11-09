import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyDatabaseIn,
  describeDatabase,
  REAL_DATABASE_FILE,
  resolveDatabasePath,
  samePath,
  SCRATCH_DATABASE_FILE,
  type DatabaseTarget,
} from "~/adapters/persistence/database-target";

export { describeDatabase, REAL_DATABASE_FILE, SCRATCH_DATABASE_FILE };
export type { DatabaseTarget };

/**
 * Which SQLite file a command is about to open, and whether it is the live ledger.
 *
 * The ledger holds real trades and is the one thing in this project that cannot be
 * regenerated: prices can be re-synced, holdings re-imported, the Prisma client
 * re-generated. A destroyed ledger is fourteen months of broker exports re-entered by
 * hand. So every destructive path asks here first, and this module answers
 * conservatively — see `assertScratchDatabase`.
 */

export const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));

export function realDatabasePath(): string {
  return resolve(PROJECT_ROOT, REAL_DATABASE_FILE);
}

export function backupsDirectory(): string {
  return resolve(PROJECT_ROOT, "data/backups");
}

export function scratchDatabasePath(): string {
  return resolve(PROJECT_ROOT, SCRATCH_DATABASE_FILE);
}

export function databasePath(url = process.env.DATABASE_URL): string | null {
  return resolveDatabasePath(url, PROJECT_ROOT);
}

export function isRealDatabase(path: string): boolean {
  return samePath(path, realDatabasePath());
}

export function isScratchDatabase(path: string): boolean {
  return samePath(path, scratchDatabasePath());
}

export function assertScratchDatabase(action: string): string {
  const url = process.env.DATABASE_URL;
  const target = databasePath(url);

  if (target === null) {
    throw new Error(
      `Refusing to ${action}: DATABASE_URL is ${url ? `"${url}"` : "not set"}, ` +
        `which does not resolve to a local SQLite file. Point it at the scratch ` +
        `database (file:./${SCRATCH_DATABASE_FILE}) and run again.`,
    );
  }

  if (isRealDatabase(target)) {
    throw new Error(
      `Refusing to ${action}: DATABASE_URL points at the live ledger ` +
        `(${REAL_DATABASE_FILE}). That file holds real trades and is not a test ` +
        `target. Use file:./${SCRATCH_DATABASE_FILE}, or run \`pnpm db:backup\` ` +
        `first and re-point DATABASE_URL deliberately.`,
    );
  }

  if (!isScratchDatabase(target)) {
    throw new Error(
      `Refusing to ${action}: DATABASE_URL resolves to ${target}, which is not the ` +
        `scratch database. Destructive commands run only against ` +
        `file:./${SCRATCH_DATABASE_FILE} — an allow-list, so an unrecognised path is ` +
        `refused rather than assumed safe. Change SCRATCH_DATABASE_FILE if you mean ` +
        `to add one.`,
    );
  }

  return target;
}

export function classifyDatabase(
  url = process.env.DATABASE_URL,
): DatabaseTarget {
  return classifyDatabaseIn(url, PROJECT_ROOT);
}

export function announceDatabase(
  url = process.env.DATABASE_URL,
): DatabaseTarget {
  const target = classifyDatabase(url);
  const exists = target.kind !== "unresolved" && existsSync(target.path);
  console.error(describeDatabase(target, exists));
  return target;
}
