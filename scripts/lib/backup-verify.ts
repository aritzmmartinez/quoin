import { existsSync, unlinkSync } from "node:fs";

import Database from "better-sqlite3";

/**
 * Prove a snapshot is a database before anything treats it as one.
 *
 * Separated from `db-backup.ts` so it can be tested against a genuinely corrupt file.
 * That mattered: this is the step that decides whether a backup counts as good, and
 * rotation — the only destructive part — runs on the strength of its answer. A
 * verification that fails open would let a bad copy displace a good one. `PRAGMA
 * integrity_check` being written down is not evidence that its result is read correctly.
 */

export function tableCounts(db: Database.Database): Map<string, number> {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name`,
    )
    .all() as { name: string }[];

  const counts = new Map<string, number>();
  for (const { name } of tables) {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get() as {
      n: number;
    };
    counts.set(name, row.n);
  }
  return counts;
}

export function describeCountMismatches(
  source: ReadonlyMap<string, number>,
  copy: ReadonlyMap<string, number>,
): string[] {
  const problems: string[] = [];

  for (const [table, expected] of source) {
    const actual = copy.get(table);
    if (actual === undefined) {
      problems.push(
        `${table}: missing from the copy (${expected} rows expected)`,
      );
    } else if (actual !== expected) {
      problems.push(
        `${table}: ${expected} rows in the ledger, ${actual} in the copy`,
      );
    }
  }

  for (const table of copy.keys()) {
    if (!source.has(table)) problems.push(`${table}: present only in the copy`);
  }

  return problems;
}

export function verifyBackup(
  destination: string,
  expected: ReadonlyMap<string, number>,
): void {
  let copy: Database.Database | undefined;
  try {
    copy = new Database(destination, { readonly: true, fileMustExist: true });

    const integrity = copy.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") {
      throw new Error(
        `SQLite reports the copy as damaged: ${String(integrity)}`,
      );
    }

    const problems = describeCountMismatches(expected, tableCounts(copy));
    if (problems.length > 0) {
      throw new Error(
        `the copy does not match the source:\n  - ${problems.join("\n  - ")}\n` +
          `If the app was writing during the backup, run it again with nothing else ` +
          `touching the database.`,
      );
    }
  } finally {
    copy?.close();
  }
}

export function verifyOrDiscard(
  destination: string,
  expected: ReadonlyMap<string, number>,
): void {
  try {
    verifyBackup(destination, expected);
  } catch (error: unknown) {
    if (existsSync(destination)) unlinkSync(destination);
    throw new Error(
      `Backup verification failed, ${error instanceof Error ? error.message : error}`,
      { cause: error },
    );
  }
}
