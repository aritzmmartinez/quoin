import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const MIGRATIONS = "prisma/migrations";
const TARGET = "20261021120000_ledger_fx_provenance";

function migrationsBefore(target: string): string[] {
  return readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name < target)
    .map((entry) => entry.name)
    .sort();
}

const sqlOf = (name: string) =>
  readFileSync(join(MIGRATIONS, name, "migration.sql"), "utf8");

describe("ledger FX provenance migration (integration)", () => {
  it("applies over a ledger that already holds a foreign row counted one-to-one", () => {
    const db = new Database(":memory:");
    for (const name of migrationsBefore(TARGET)) db.exec(sqlOf(name));

    db.prepare(
      `INSERT INTO "LedgerEntry"
         ("id", "ts", "type", "grossAmount", "currency", "fxToBase",
          "account", "source", "externalId")
       VALUES (?, ?, 'DEPOSIT', ?, 'USD', '1', 'kraken', 'KRAKEN_CSV', ?)`,
    ).run("legacy-usd", "2025-11-13T18:04:48.000Z", "500", "LSYNTH-0001");

    expect(() => db.exec(sqlOf(TARGET))).not.toThrow();

    expect(
      db
        .prepare(
          `SELECT "fxSource", "fxRate", "fxDirection", "fxDate",
                  "originalAmount", "originalCurrency"
             FROM "LedgerEntry" WHERE "id" = 'legacy-usd'`,
        )
        .get(),
    ).toEqual({
      fxSource: "IDENTITY",
      fxRate: null,
      fxDirection: null,
      fxDate: null,
      originalAmount: "500",
      originalCurrency: "USD",
    });
    db.close();
  });
});
