import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const MIGRATIONS = "prisma/migrations";
const TARGET = "20261029090000_ledger_external_id";

function migrationsBefore(target: string): string[] {
  return readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name < target)
    .map((entry) => entry.name)
    .sort();
}

const sqlOf = (name: string) =>
  readFileSync(join(MIGRATIONS, name, "migration.sql"), "utf8");

function insert(
  db: Database.Database,
  id: string,
  source: string,
  externalId: string | null,
): void {
  db.prepare(
    `INSERT INTO "LedgerEntry"
       ("id", "ts", "type", "grossAmount", "currency", "account", "source", "externalId")
     VALUES (?, '2025-01-01T10:00:00.000Z', 'DEPOSIT', '100', 'EUR', 'trade-republic', ?, ?)`,
  ).run(id, source, externalId);
}

describe("ledger externalId backfill (integration)", () => {
  it("gives every entry without a source id a key of its own, and leaves the rest", () => {
    const db = new Database(":memory:");
    for (const name of migrationsBefore(TARGET)) db.exec(sqlOf(name));
    insert(db, "manual-1", "MANUAL", null);
    insert(db, "manual-2", "MANUAL", null);
    insert(db, "blank", "TR_CSV", "");
    insert(db, "broker", "TR_CSV", "t-1");
    const tablesBefore = db
      .prepare(`SELECT "name", "sql" FROM sqlite_master ORDER BY "name"`)
      .all();

    db.exec(sqlOf(TARGET));

    expect(
      db
        .prepare(`SELECT "id", "externalId" FROM "LedgerEntry" ORDER BY "id"`)
        .all(),
    ).toEqual([
      { id: "blank", externalId: "local:blank" },
      { id: "broker", externalId: "t-1" },
      { id: "manual-1", externalId: "local:manual-1" },
      { id: "manual-2", externalId: "local:manual-2" },
    ]);
    expect(
      db
        .prepare(`SELECT "name", "sql" FROM sqlite_master ORDER BY "name"`)
        .all(),
    ).toEqual(tablesBefore);
    expect(() =>
      db.exec(`UPDATE "LedgerEntry" SET "type" = 'FEE' WHERE "id" = 'broker'`),
    ).toThrow(/CHECK constraint failed/);
    db.close();
  });
});
