import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const MIGRATIONS = "prisma/migrations";
const TARGET = "20261028090000_target_active_day";

function migrationsBefore(target: string): string[] {
  return readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name < target)
    .map((entry) => entry.name)
    .sort();
}

const sqlOf = (name: string) =>
  readFileSync(join(MIGRATIONS, name, "migration.sql"), "utf8");

function before(): Database.Database {
  const db = new Database(":memory:");
  for (const name of migrationsBefore(TARGET)) db.exec(sqlOf(name));
  return db;
}

function insert(
  db: Database.Database,
  id: string,
  activeFrom: string,
  createdAt: string,
  lines: string[] = [],
): void {
  db.prepare(
    `INSERT INTO "PortfolioTarget" ("id", "name", "activeFrom", "createdAt")
     VALUES (?, ?, ?, ?)`,
  ).run(id, id, activeFrom, createdAt);
  for (const instrumentId of lines) {
    db.prepare(
      `INSERT INTO "PortfolioTargetLine" ("id", "targetId", "instrumentId", "monthlyAmount")
       VALUES (?, ?, ?, '100')`,
    ).run(`${id}:${instrumentId}`, id, instrumentId);
  }
}

const days = (db: Database.Database) =>
  db
    .prepare(`SELECT "id", "activeFrom" FROM "PortfolioTarget" ORDER BY "id"`)
    .all();

const schemaOutsideTarget = (db: Database.Database) =>
  db
    .prepare(
      `SELECT "type", "name", "sql" FROM sqlite_master
        WHERE "tbl_name" <> 'PortfolioTarget' ORDER BY "type", "name"`,
    )
    .all();

describe("PortfolioTarget.activeFrom as a calendar day (integration)", () => {
  it("turns every instant Prisma wrote into its Madrid day", () => {
    const db = before();
    const created = "2026-10-01T00:00:00.000+00:00";
    insert(db, "form", "2026-03-29T00:00:00.000+00:00", created);
    insert(db, "cli-late", "2026-10-24T22:30:00.123+00:00", created);
    insert(db, "new-year", "2026-12-31T23:30:00.000+00:00", created);
    insert(db, "summer-before", "2026-07-01T21:59:59.999+00:00", created);
    insert(db, "summer-after", "2026-07-02T22:00:00.000+00:00", created);

    db.exec(sqlOf(TARGET));

    expect(days(db)).toEqual([
      { id: "cli-late", activeFrom: "2026-10-25" },
      { id: "form", activeFrom: "2026-03-29" },
      { id: "new-year", activeFrom: "2027-01-01" },
      { id: "summer-after", activeFrom: "2026-07-03" },
      { id: "summer-before", activeFrom: "2026-07-01" },
    ]);
    db.close();
  });

  it("keeps the version that was in force on a day with several, and deletes the rest with their lines", () => {
    const db = before();
    insert(
      db,
      "early",
      "2026-02-28T23:30:00.000+00:00",
      "2026-03-05T00:00:00.000+00:00",
      ["A"],
    );
    insert(
      db,
      "first",
      "2026-03-01T00:00:00.000+00:00",
      "2026-02-20T10:00:00.000+00:00",
      ["A", "B"],
    );
    insert(
      db,
      "correction",
      "2026-03-01T00:00:00.000+00:00",
      "2026-02-28T10:00:00.000+00:00",
      ["A", "C"],
    );
    insert(
      db,
      "other-day",
      "2026-04-01T00:00:00.000+00:00",
      "2026-02-20T10:00:00.000+00:00",
      ["A"],
    );
    insert(
      db,
      "tie-a",
      "2026-05-01T00:00:00.000+00:00",
      "2026-04-20T10:00:00.000+00:00",
    );
    insert(
      db,
      "tie-b",
      "2026-05-01T00:00:00.000+00:00",
      "2026-04-20T10:00:00.000+00:00",
    );

    db.exec(sqlOf(TARGET));

    expect(days(db)).toEqual([
      { id: "correction", activeFrom: "2026-03-01" },
      { id: "other-day", activeFrom: "2026-04-01" },
      { id: "tie-b", activeFrom: "2026-05-01" },
    ]);
    expect(
      db.prepare(`SELECT "id" FROM "PortfolioTargetLine" ORDER BY "id"`).all(),
    ).toEqual([
      { id: "correction:A" },
      { id: "correction:C" },
      { id: "other-day:A" },
    ]);
    db.close();
  });

  it("leaves one version per day and a well-formed day, renamed CHECK included", () => {
    const db = before();
    insert(
      db,
      "v1",
      "2026-03-01T00:00:00.000+00:00",
      "2026-02-20T10:00:00.000+00:00",
    );
    db.exec(sqlOf(TARGET));

    const write = (id: string, day: string) =>
      db
        .prepare(
          `INSERT INTO "PortfolioTarget" ("id", "name", "activeFrom") VALUES (?, ?, ?)`,
        )
        .run(id, id, day);

    expect(() => write("v2", "2026-03-01")).toThrow(/UNIQUE/);
    expect(() => write("v3", "2026-03-01T00:00:00.000Z")).toThrow(/CHECK/);
    expect(() => write("v4", "2026-04-01")).not.toThrow();
    expect(
      db
        .prepare(
          `SELECT "name" FROM sqlite_master WHERE "type" = 'index' AND "tbl_name" = 'PortfolioTarget' ORDER BY "name"`,
        )
        .all(),
    ).toEqual([
      { name: "PortfolioTarget_activeFrom_key" },
      { name: "sqlite_autoindex_PortfolioTarget_1" },
    ]);
    db.close();
  });

  it("changes nothing outside PortfolioTarget, so every CHECK elsewhere survives", () => {
    const db = before();
    const untouched = schemaOutsideTarget(db);
    db.exec(sqlOf(TARGET));
    expect(schemaOutsideTarget(db)).toEqual(untouched);

    const checks = (table: string) =>
      (
        db
          .prepare(`SELECT "sql" FROM sqlite_master WHERE "name" = ?`)
          .get(table) as { sql: string }
      ).sql;
    expect(checks("LedgerEntry")).toMatch(/CHECK/);
    expect(checks("Instrument")).toMatch(/CHECK/);
    expect(checks("Settings")).toMatch(/CHECK/);
    db.close();
  });

  it("refuses an unreadable value before changing anything", () => {
    const db = before();
    insert(db, "bad", "not a date", "2026-02-20T10:00:00.000+00:00");
    const schema = db
      .prepare(
        `SELECT "sql" FROM sqlite_master WHERE "name" = 'PortfolioTarget'`,
      )
      .get();

    expect(() => db.exec(sqlOf(TARGET))).toThrow(/CHECK/);
    expect(
      db
        .prepare(
          `SELECT "sql" FROM sqlite_master WHERE "name" = 'PortfolioTarget'`,
        )
        .get(),
    ).toEqual(schema);
    db.close();
  });
});
