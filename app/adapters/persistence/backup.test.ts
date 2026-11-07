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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { backupDatabase, describeBackup, snapshotDatabase } from "./backup";
import { KEEP } from "./backup-names";

const between = vi.hoisted(() => ({ vacuumAndCount: vi.fn() }));

vi.mock("./backup-verify", async (original) => {
  const actual = await original<typeof import("./backup-verify")>();
  return {
    ...actual,
    tableCounts: (db: Database.Database) => {
      between.vacuumAndCount();
      return actual.tableCounts(db);
    },
  };
});

let root: string;
let source: string;
let directory: string;
let destination: string;

function insertIntoSource(): void {
  const db = new Database(source);
  db.exec("INSERT INTO ledger (note) VALUES ('written during the backup')");
  db.close();
}

beforeEach(() => {
  between.vacuumAndCount.mockReset();
  root = mkdtempSync(join(tmpdir(), "quoin-backup-"));
  source = join(root, "source.sqlite");
  directory = join(root, "nested", "backups");
  destination = join(root, "copy.sqlite");
  const db = new Database(source);
  db.exec("CREATE TABLE ledger (id INTEGER PRIMARY KEY, note TEXT)");
  db.exec("INSERT INTO ledger (note) VALUES ('a'), ('b')");
  db.close();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("snapshotDatabase", () => {
  it("copies again when a write lands between the copy and the count", () => {
    between.vacuumAndCount.mockImplementationOnce(insertIntoSource);

    const result = snapshotDatabase(source, destination);

    expect(between.vacuumAndCount).toHaveBeenCalledTimes(2);
    expect(result.rows).toBe(3);
    const copy = new Database(destination, { readonly: true });
    expect(copy.prepare("SELECT COUNT(*) AS n FROM ledger").get()).toEqual({
      n: 3,
    });
    copy.close();
  });

  it("fails and leaves no file when the second copy does not match either", () => {
    between.vacuumAndCount.mockImplementation(insertIntoSource);

    expect(() => snapshotDatabase(source, destination)).toThrow(
      /does not match the source/,
    );

    expect(between.vacuumAndCount).toHaveBeenCalledTimes(2);
    expect(existsSync(destination)).toBe(false);
  });

  it("does not retry a copy SQLite reports as damaged", () => {
    const db = new Database(source);
    db.exec(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 800)
       INSERT INTO ledger (note) SELECT printf('%070d', i) FROM n`,
    );
    db.close();
    between.vacuumAndCount.mockImplementation(() => {
      const bytes = readFileSync(destination);
      const start = Math.floor(bytes.length / 2);
      bytes.fill(0xa5, start, Math.min(start + 3000, bytes.length));
      writeFileSync(destination, bytes);
    });

    expect(() => snapshotDatabase(source, destination)).toThrow(
      /reports the copy as damaged/,
    );

    expect(between.vacuumAndCount).toHaveBeenCalledOnce();
    expect(existsSync(destination)).toBe(false);
  });
});

describe("backupDatabase", () => {
  it("writes a verified snapshot into the directory it is given", () => {
    const result = backupDatabase(source, directory);

    expect(existsSync(result.destination)).toBe(true);
    expect(result.destination.startsWith(directory)).toBe(true);
    expect(result).toMatchObject({ source, tables: 1, rows: 2, removed: 0 });
  });

  it("takes several snapshots in the same second under distinct names", () => {
    const destinations = [1, 2, 3].map(
      () => backupDatabase(source, directory).destination,
    );

    expect(new Set(destinations).size).toBe(3);
    expect(readdirSync(directory)).toHaveLength(3);
  });

  it("rotates only named snapshots, leaving a subdirectory alone", () => {
    mkdirSync(join(directory, "sync"), { recursive: true });
    const synced = join(directory, "sync", "quoin-sync-2026-01-01.sqlite");
    writeFileSync(synced, "");
    for (let i = 0; i < KEEP; i++) {
      writeFileSync(
        join(directory, `quoin-20200101-${String(i).padStart(4, "0")}.sqlite`),
        "",
      );
    }

    const { removed, destination: written } = backupDatabase(source, directory);

    expect(removed).toBe(1);
    expect(existsSync(written)).toBe(true);
    expect(existsSync(synced)).toBe(true);
    expect(readdirSync(directory)).toHaveLength(KEEP + 1);
  });

  it("reports paths relative to the root it is given", () => {
    const text = describeBackup(backupDatabase(source, directory), root);

    expect(text).toContain("Backed up source.sqlite → ");
    expect(text).toContain("2 rows");
    expect(text).not.toContain(root);
  });
});
