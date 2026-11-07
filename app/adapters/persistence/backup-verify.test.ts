import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  describeCountMismatches,
  tableCounts,
  verifyBackup,
  verifyOrDiscard,
} from "./backup-verify";

let dir: string;
let source: string;
let copy: string;

function makeDatabase(path: string, rows = 800): void {
  const db = new Database(path);
  db.exec("CREATE TABLE ledger (id INTEGER PRIMARY KEY, note TEXT)");
  db.exec("CREATE TABLE instrument (id INTEGER PRIMARY KEY, name TEXT)");

  const insert = db.prepare("INSERT INTO ledger (note) VALUES (?)");
  const many = db.transaction((n: number) => {
    for (let i = 0; i < n; i += 1) insert.run(`entry ${i} ${"x".repeat(60)}`);
  });
  many(rows);
  db.prepare("INSERT INTO instrument (name) VALUES (?)").run("Demo Fund");
  db.close();
}

function snapshot(from: string, to: string): Map<string, number> {
  const db = new Database(from, { readonly: true, fileMustExist: true });
  try {
    db.exec(`VACUUM INTO '${to.replaceAll("'", "''")}'`);
    return tableCounts(db);
  } finally {
    db.close();
  }
}

function corrupt(path: string): void {
  const bytes = readFileSync(path);
  const start = Math.floor(bytes.length / 2);
  bytes.fill(0xa5, start, Math.min(start + 3000, bytes.length));
  writeFileSync(path, bytes);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "quoin-backup-"));
  source = join(dir, "source.sqlite");
  copy = join(dir, "copy.sqlite");
  makeDatabase(source);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("describeCountMismatches", () => {
  it("is silent when the two agree", () => {
    const counts = new Map([["ledger", 800]]);
    expect(describeCountMismatches(counts, new Map(counts))).toEqual([]);
  });

  it("reports a table that lost rows", () => {
    expect(
      describeCountMismatches(
        new Map([["ledger", 800]]),
        new Map([["ledger", 799]]),
      ),
    ).toEqual(["ledger: 800 rows in the ledger, 799 in the copy"]);
  });

  it("reports a table missing from the copy", () => {
    expect(
      describeCountMismatches(new Map([["ledger", 800]]), new Map()),
    ).toEqual(["ledger: missing from the copy (800 rows expected)"]);
  });

  it("reports a table that exists only in the copy", () => {
    expect(describeCountMismatches(new Map(), new Map([["ghost", 1]]))).toEqual(
      ["ghost: present only in the copy"],
    );
  });

  it("does not treat an empty table as a missing one", () => {
    const counts = new Map([["ledger", 0]]);
    expect(describeCountMismatches(counts, new Map(counts))).toEqual([]);
  });
});

describe("verifyBackup", () => {
  it("accepts a good snapshot", () => {
    const expected = snapshot(source, copy);
    expect(() => verifyBackup(copy, expected)).not.toThrow();
    expect(expected.get("ledger")).toBe(800);
  });

  it("rejects a copy SQLite reports as damaged", () => {
    const expected = snapshot(source, copy);
    corrupt(copy);

    expect(() => verifyBackup(copy, expected)).toThrow(
      /reports the copy as damaged/,
    );
  });

  it("rejects a truncated copy rather than reading it as a small database", () => {
    const expected = snapshot(source, copy);
    writeFileSync(copy, readFileSync(copy).subarray(0, 4096));
    expect(() => verifyBackup(copy, expected)).toThrow();
  });

  it("rejects a copy that opens cleanly but has lost rows", () => {
    const expected = snapshot(source, copy);

    const db = new Database(copy);
    db.exec("DELETE FROM ledger WHERE id > 700");
    db.close();

    expect(() => verifyBackup(copy, expected)).toThrow(/rows in the ledger/);
  });

  it("rejects a copy missing a table entirely", () => {
    const expected = snapshot(source, copy);

    const db = new Database(copy);
    db.exec("DROP TABLE instrument");
    db.close();

    expect(() => verifyBackup(copy, expected)).toThrow(/instrument: missing/);
  });

  it("rejects a file that is not a database at all", () => {
    writeFileSync(copy, "this is not a database");
    expect(() => verifyBackup(copy, new Map())).toThrow();
  });
});

describe("verifyOrDiscard", () => {
  it("leaves a good snapshot in place", () => {
    const expected = snapshot(source, copy);
    verifyOrDiscard(copy, expected);
    expect(existsSync(copy)).toBe(true);
  });

  it("deletes a corrupt snapshot, so rotation never counts it", () => {
    const expected = snapshot(source, copy);
    corrupt(copy);

    expect(() => verifyOrDiscard(copy, expected)).toThrow(
      /verification failed/,
    );
    expect(existsSync(copy)).toBe(false);
  });

  it("deletes a snapshot that is short of rows", () => {
    const expected = snapshot(source, copy);

    const db = new Database(copy);
    db.exec("DELETE FROM ledger");
    db.close();

    expect(() => verifyOrDiscard(copy, expected)).toThrow();
    expect(existsSync(copy)).toBe(false);
  });

  it("keeps the underlying reason as the cause", () => {
    const expected = snapshot(source, copy);
    corrupt(copy);

    try {
      verifyOrDiscard(copy, expected);
      expect.unreachable("should have thrown");
    } catch (error: unknown) {
      expect((error as Error).cause).toBeInstanceOf(Error);
    }
  });
});
