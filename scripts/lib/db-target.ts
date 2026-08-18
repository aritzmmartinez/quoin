import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Which SQLite file a command is about to open, and whether it is the live ledger.
 *
 * The ledger holds real trades and is the one thing in this project that cannot be
 * regenerated: prices can be re-synced, holdings re-imported, the Prisma client
 * re-generated. A destroyed ledger is fourteen months of broker exports re-entered by
 * hand. So every destructive path asks here first, and this module answers
 * conservatively — see `assertScratchDatabase`.
 */

/** The live ledger, relative to the project root. */
export const REAL_DATABASE_FILE = "data/quoin.sqlite";

/**
 * The one database a destructive command may open. An allow-list of exactly one entry,
 * deliberately: "not the ledger" would let a typo through to any other path, and the
 * whole point is that the set of safe targets is known, not merely constrained.
 */
export const SCRATCH_DATABASE_FILE = "data/dev.sqlite";

export const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));

export function realDatabasePath(): string {
  return resolve(PROJECT_ROOT, REAL_DATABASE_FILE);
}

export function scratchDatabasePath(): string {
  return resolve(PROJECT_ROOT, SCRATCH_DATABASE_FILE);
}

export function databasePath(url = process.env.DATABASE_URL): string | null {
  if (!url) return null;
  if (!url.startsWith("file:")) return null;

  const target = url.slice("file:".length);
  if (target === "" || target === ":memory:") return null;

  return resolve(PROJECT_ROOT, target);
}

function samePath(a: string, b: string): boolean {
  return process.platform === "win32"
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
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
