import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";

import Database from "better-sqlite3";

import { backupFileName, backupsToRemove, KEEP } from "./backup-names";
import { tableCounts, verifyOrDiscard } from "./backup-verify";
import { PROJECT_ROOT } from "./db-target";

const BACKUP_DIR = resolve(PROJECT_ROOT, "data/backups");

export interface BackupResult {
  source: string;
  destination: string;
  size: number;
  tables: number;
  rows: number;
  removed: number;
}

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

export function backupDatabase(source: string): BackupResult {
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
  const removed = rotate();

  return {
    source,
    destination,
    size,
    tables: expected.size,
    rows,
    removed,
  };
}

export function describeBackup(result: BackupResult): string {
  const lines = [
    `Backed up ${relative(PROJECT_ROOT, result.source)} → ` +
      `${relative(PROJECT_ROOT, result.destination)} (${(result.size / 1024 / 1024).toFixed(1)} MB)`,
    `  verified: integrity_check ok, ${result.tables} tables, ${result.rows} rows`,
  ];
  if (result.removed > 0) {
    lines.push(
      `Rotated out ${result.removed} backup(s) beyond the last ${KEEP}.`,
    );
  }
  return lines.join("\n");
}
