/**
 * Naming and rotation for ledger snapshots, kept pure and away from the filesystem.
 *
 * Same split as the parsers: deciding *which* backups to delete is arithmetic and gets
 * tested; deleting them is I/O. Rotation is the one part of the backup script that
 * destroys data, so it is the part that least deserves to be untested.
 */

export const KEEP = 30;
export const BACKUP_NAME = /^quoin-\d{8}-\d{4}(-\d{2})?\.sqlite$/;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

export function stamp(now: Date): string {
  return (
    `${pad(now.getFullYear(), 4)}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}

export function backupFileName(now: Date, seconds?: number): string {
  const suffix = seconds === undefined ? "" : `-${pad(seconds)}`;
  return `quoin-${stamp(now)}${suffix}.sqlite`;
}

export function backupsToRemove(
  files: readonly string[],
  keep: number = KEEP,
): string[] {
  if (keep < 0) throw new RangeError(`keep must not be negative, got ${keep}`);

  return files
    .filter((file) => BACKUP_NAME.test(file))
    .sort()
    .reverse()
    .slice(keep);
}
