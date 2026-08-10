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

/** `DATABASE_URL` resolves from the project ROOT, not from `prisma/schema.prisma`. */
export const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));

export function realDatabasePath(): string {
  return resolve(PROJECT_ROOT, REAL_DATABASE_FILE);
}

export function scratchDatabasePath(): string {
  return resolve(PROJECT_ROOT, SCRATCH_DATABASE_FILE);
}

/**
 * Absolute path of the SQLite file a `file:` URL points at, or null when the URL is
 * missing or is not a local file (`:memory:`, a remote datasource, a malformed value).
 * Null means "unknown", never "safe" — callers must treat it as a refusal.
 */
export function databasePath(url = process.env.DATABASE_URL): string | null {
  if (!url) return null;
  if (!url.startsWith("file:")) return null;

  const target = url.slice("file:".length);
  if (target === "" || target === ":memory:") return null;

  return resolve(PROJECT_ROOT, target);
}

/** Windows paths differ only in case; comparing them literally would miss a match. */
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

/**
 * Refuse to continue unless the command is pointed at the scratch database.
 *
 * This is an **allow-list**, and the distinction matters more than it looks. "Refuse
 * the ledger" would wave through `data/quoin.sqlite.bak`, a mistyped `data/quoin.sqlit`,
 * or a path some future script computes wrongly — every one of them a file nobody chose
 * to destroy. Naming the single permitted target means a new safe database is an
 * explicit edit here, not an accident.
 *
 * Fails closed for the same reason: an unset or unparseable `DATABASE_URL` refuses too.
 * A guard that passes when it cannot tell what it is guarding is not a guard, and the
 * cost of a false refusal is one explicit env var, against an irreplaceable file.
 *
 * This is the backstop, not the main defence. The main defence is that agents run with
 * `DATABASE_URL` already pointing at the scratch database (see `.claude/settings.json`),
 * so nothing has to remember to call this.
 */
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

  // Called out separately: the generic message below is true but underplays this one.
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
