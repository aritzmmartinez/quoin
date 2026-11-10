import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  backupBeforeSync,
  SYNC_BACKUP_KEEP,
  syncBackupFileName,
  syncBackupsToRemove,
} from "./sync-backup";

const DAY = "2026-11-06";

let root: string;
let source: string;
let directory: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "quoin-sync-backup-"));
  source = join(root, "source.sqlite");
  directory = join(root, "backups", "sync");
  const db = new Database(source);
  db.exec("CREATE TABLE ledger (id INTEGER PRIMARY KEY)");
  db.exec("INSERT INTO ledger VALUES (1), (2)");
  db.close();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const days = (count: number) =>
  Array.from(
    { length: count },
    (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`,
  );

describe("syncBackupsToRemove", () => {
  it("removes nothing at or under the limit", () => {
    const files = days(SYNC_BACKUP_KEEP).map(syncBackupFileName);
    expect(syncBackupsToRemove(files)).toEqual([]);
  });

  it("removes the oldest days beyond the limit, in any order", () => {
    const files = days(SYNC_BACKUP_KEEP + 2).map(syncBackupFileName);
    expect(syncBackupsToRemove([...files].reverse()).sort()).toEqual(
      files.slice(0, 2),
    );
  });

  it("ignores anything it did not name", () => {
    const strays = [
      "quoin-20260101-0000.sqlite",
      "quoin-sync-2026-01-01.sqlite.tmp",
      "notes.txt",
    ];
    expect(syncBackupsToRemove(strays, 0)).toEqual([]);
  });
});

describe("backupBeforeSync", () => {
  it("writes a verified snapshot named after the day", () => {
    const snapshot = backupBeforeSync(source, directory, DAY);

    expect(snapshot).toMatchObject({
      destination: join(directory, "quoin-sync-2026-11-06.sqlite"),
      rows: 2,
    });
    expect(readdirSync(directory)).toEqual(["quoin-sync-2026-11-06.sqlite"]);
  });

  it("keeps the day's first snapshot and takes no second one", () => {
    backupBeforeSync(source, directory, DAY);
    const first = readFileSync(join(directory, syncBackupFileName(DAY)));

    const db = new Database(source);
    db.exec("INSERT INTO ledger VALUES (3)");
    db.close();

    expect(backupBeforeSync(source, directory, DAY)).toBeNull();
    expect(readFileSync(join(directory, syncBackupFileName(DAY)))).toEqual(
      first,
    );
  });

  it("takes a new snapshot on a new day", () => {
    backupBeforeSync(source, directory, "2026-11-06");
    backupBeforeSync(source, directory, "2026-11-07");

    expect(readdirSync(directory)).toHaveLength(2);
  });

  it("keeps the last days and removes the oldest", () => {
    mkdirSync(directory, { recursive: true });
    for (const day of days(SYNC_BACKUP_KEEP)) {
      writeFileSync(join(directory, syncBackupFileName(day)), "");
    }

    backupBeforeSync(source, directory, DAY);

    expect(readdirSync(directory)).toHaveLength(SYNC_BACKUP_KEEP);
    expect(existsSync(join(directory, syncBackupFileName("2026-01-01")))).toBe(
      false,
    );
    expect(existsSync(join(directory, syncBackupFileName(DAY)))).toBe(true);
  });

  it("is not fooled by a copy left half-written by a crash", () => {
    mkdirSync(directory, { recursive: true });
    const leftover = join(directory, `${syncBackupFileName(DAY)}.tmp`);
    writeFileSync(leftover, "half a copy");

    const snapshot = backupBeforeSync(source, directory, DAY);

    expect(snapshot?.rows).toBe(2);
    expect(readdirSync(directory)).toEqual([syncBackupFileName(DAY)]);
  });

  it("removes what a dead process left from any day, and nothing else", () => {
    backupBeforeSync(source, directory, DAY);
    const orphan = join(directory, "quoin-sync-2026-01-01.sqlite.tmp");
    const unrelated = join(directory, "notes.tmp");
    writeFileSync(orphan, "half a copy");
    writeFileSync(unrelated, "");

    expect(backupBeforeSync(source, directory, DAY)).toBeNull();

    expect(existsSync(orphan)).toBe(false);
    expect(existsSync(unrelated)).toBe(true);
    expect(existsSync(join(directory, syncBackupFileName(DAY)))).toBe(true);
  });

  it("throws and leaves nothing named for the day when the copy fails", () => {
    const missing = join(root, "missing.sqlite");

    expect(() => backupBeforeSync(missing, directory, DAY)).toThrow();

    expect(existsSync(join(directory, syncBackupFileName(DAY)))).toBe(false);
  });
});
