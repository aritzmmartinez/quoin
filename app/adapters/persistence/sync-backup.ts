import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";

import { snapshotDatabase, type Snapshot } from "./backup";

export const SYNC_BACKUP_KEEP = 14;
const SYNC_BACKUP_NAME = /^quoin-sync-\d{4}-\d{2}-\d{2}\.sqlite$/;

export function syncBackupFileName(day: string): string {
  return `quoin-sync-${day}.sqlite`;
}

export function syncBackupsToRemove(
  files: readonly string[],
  keep: number = SYNC_BACKUP_KEEP,
): string[] {
  return files
    .filter((file) => SYNC_BACKUP_NAME.test(file))
    .sort()
    .reverse()
    .slice(keep);
}

export function backupBeforeSync(
  source: string,
  directory: string,
  day: string,
): Snapshot | null {
  const destination = join(directory, syncBackupFileName(day));
  if (existsSync(destination)) return null;

  mkdirSync(directory, { recursive: true });
  const partial = `${destination}.tmp`;
  rmSync(partial, { force: true });
  const snapshot = snapshotDatabase(source, partial);
  renameSync(partial, destination);

  for (const file of syncBackupsToRemove(readdirSync(directory))) {
    unlinkSync(join(directory, file));
  }
  return { ...snapshot, destination };
}
