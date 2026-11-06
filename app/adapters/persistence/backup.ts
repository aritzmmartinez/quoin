import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join, relative } from "node:path";

import Database from "better-sqlite3";

import { backupsToRemove, freeBackupFileName, KEEP } from "./backup-names";
import {
  CountMismatchError,
  tableCounts,
  verifyOrDiscard,
} from "./backup-verify";

export interface Snapshot {
  source: string;
  destination: string;
  size: number;
  tables: number;
  rows: number;
}

export interface BackupResult extends Snapshot {
  removed: number;
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function destinationFor(directory: string, now: Date): string {
  return join(
    directory,
    freeBackupFileName(now, (name) => existsSync(join(directory, name))),
  );
}

function rotate(directory: string): number {
  const doomed = backupsToRemove(readdirSync(directory));
  for (const file of doomed) unlinkSync(join(directory, file));
  return doomed.length;
}

export function snapshotDatabase(
  source: string,
  destination: string,
): Snapshot {
  try {
    return copyAndVerify(source, destination);
  } catch (error: unknown) {
    if (
      !(error instanceof Error && error.cause instanceof CountMismatchError)
    ) {
      throw error;
    }
    return copyAndVerify(source, destination);
  }
}

function copyAndVerify(source: string, destination: string): Snapshot {
  const db = new Database(source, { readonly: true, fileMustExist: true });
  let expected: Map<string, number>;
  try {
    db.exec(`VACUUM INTO ${sqlLiteral(destination)}`);
    expected = tableCounts(db);
  } finally {
    db.close();
  }

  verifyOrDiscard(destination, expected);

  return {
    source,
    destination,
    size: statSync(destination).size,
    tables: expected.size,
    rows: [...expected.values()].reduce((sum, n) => sum + n, 0),
  };
}

export function backupDatabase(
  source: string,
  directory: string,
): BackupResult {
  mkdirSync(directory, { recursive: true });
  const snapshot = snapshotDatabase(
    source,
    destinationFor(directory, new Date()),
  );
  return { ...snapshot, removed: rotate(directory) };
}

export function describeBackup(result: BackupResult, root: string): string {
  const lines = [
    `Backed up ${relative(root, result.source)} → ` +
      `${relative(root, result.destination)} (${(result.size / 1024 / 1024).toFixed(1)} MB)`,
    `  verified: integrity_check ok, ${result.tables} tables, ${result.rows} rows`,
  ];
  if (result.removed > 0) {
    lines.push(
      `Rotated out ${result.removed} backup(s) beyond the last ${KEEP}.`,
    );
  }
  return lines.join("\n");
}
