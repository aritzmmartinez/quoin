import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const MIGRATIONS = "prisma/migrations";
const TARGET = "20261029100000_sync_ready";

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
  for (const id of ["IE00TEST0001", "IE00TEST0002", "IE00TEST0003"]) {
    db.prepare(
      `INSERT INTO "Instrument" ("id", "name", "type") VALUES (?, ?, 'ETF')`,
    ).run(id, id);
  }
  return db;
}

function holding(
  db: Database.Database,
  instrumentId: string,
  identity: string,
  asOf: string,
): void {
  db.prepare(
    `INSERT INTO "EtfHolding" ("id", "instrumentId", "identity", "identityKind", "name", "weight", "asOf")
     VALUES (?, ?, ?, 'ISIN', ?, '0.5', ?)`,
  ).run(`${instrumentId}:${identity}`, instrumentId, identity, identity, asOf);
}

const fails = (db: Database.Database, sql: string) => () => db.exec(sql);

describe("sync-ready migration (integration)", () => {
  it("turns each fund's composition into one block, telling a file's day from an import's", () => {
    const db = before();
    holding(db, "IE00TEST0001", "US00TEST0101", "2026-09-30T00:00:00.000+00:00");
    holding(db, "IE00TEST0001", "US00TEST0102", "2026-09-30T00:00:00.000+00:00");
    holding(db, "IE00TEST0002", "US00TEST0101", "2026-10-24T22:30:00.123+00:00");
    holding(db, "IE00TEST0003", "US00TEST0101", "2026-01-15T23:10:00.000+00:00");

    db.exec(sqlOf(TARGET));

    expect(
      db
        .prepare(
          `SELECT "instrumentId", "asOf", "asOfInferred", "hlc"
             FROM "EtfHoldingBlock" ORDER BY "instrumentId"`,
        )
        .all(),
    ).toEqual([
      { instrumentId: "IE00TEST0001", asOf: "2026-09-30", asOfInferred: 0, hlc: null },
      { instrumentId: "IE00TEST0002", asOf: "2026-10-25", asOfInferred: 1, hlc: null },
      { instrumentId: "IE00TEST0003", asOf: "2026-01-16", asOfInferred: 1, hlc: null },
    ]);
    expect(
      db
        .prepare(`SELECT "name" FROM pragma_table_info('EtfHolding')`)
        .all()
        .map((column) => (column as { name: string }).name),
    ).not.toContain("asOf");
    expect(db.prepare(`SELECT count(*) AS n FROM "EtfHolding"`).get()).toEqual({ n: 4 });
    db.close();
  });

  it("creates one device and refuses a second", () => {
    const db = before();
    db.exec(sqlOf(TARGET));

    const rows = db.prepare(`SELECT "deviceId", "lastHlc" FROM "SyncDevice"`).all();
    expect(rows).toHaveLength(1);
    expect(fails(db, `INSERT INTO "SyncDevice" ("id", "deviceId") VALUES (2, 'x')`)).toThrow(
      /CHECK constraint failed/,
    );
    db.close();
  });

  it("keeps every CHECK that lives only in migration SQL", () => {
    const db = before();
    db.exec(sqlOf(TARGET));
    db.exec(
      `INSERT INTO "LedgerEntry" ("id", "ts", "type", "grossAmount", "currency", "source", "externalId")
       VALUES ('e1', '2025-01-01T10:00:00.000Z', 'DEPOSIT', '100', 'EUR', 'TR_CSV', 't-1')`,
    );

    for (const sql of [
      `UPDATE "LedgerEntry" SET "type" = 'FEE'`,
      `UPDATE "LedgerEntry" SET "funding" = 'GIFT'`,
      `UPDATE "LedgerEntry" SET "fxSource" = 'GUESS'`,
      `UPDATE "LedgerEntry" SET "fxDirection" = 'SIDEWAYS'`,
      `UPDATE "Instrument" SET "thesis" = 'HOPE'`,
      `INSERT INTO "Settings" ("id", "residence") VALUES (2, 'bizkaia')`,
      `INSERT INTO "PortfolioTarget" ("id", "name", "activeFrom") VALUES ('v', 'v', '2026-11-01T00:00Z')`,
      `INSERT INTO "EtfHoldingBlock" ("instrumentId", "asOf") VALUES ('IE00TEST0001', '30/09/2026')`,
    ]) {
      expect(fails(db, sql), sql).toThrow(/CHECK constraint failed/);
    }
    db.close();
  });
});
