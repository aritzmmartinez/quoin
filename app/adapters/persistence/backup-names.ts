export const KEEP = 30;
export const BACKUP_NAME = /^quoin-\d{8}-\d{4}(-\d{2})?\.sqlite$/;
const MAX_SEQUENCE = 99;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

export function stamp(now: Date): string {
  return (
    `${pad(now.getFullYear(), 4)}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}

export function backupFileName(now: Date, sequence?: number): string {
  const suffix = sequence === undefined ? "" : `-${pad(sequence)}`;
  return `quoin-${stamp(now)}${suffix}.sqlite`;
}

export function freeBackupFileName(
  now: Date,
  taken: (name: string) => boolean,
): string {
  const base = backupFileName(now);
  if (!taken(base)) return base;
  for (let sequence = 1; sequence <= MAX_SEQUENCE; sequence++) {
    const name = backupFileName(now, sequence);
    if (!taken(name)) return name;
  }
  throw new Error(`No free backup name left for ${base}`);
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
