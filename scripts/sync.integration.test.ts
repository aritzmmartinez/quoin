import { execSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { execPath } from "node:process";

import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { formatHlc } from "~/core/sync";

const TSX = resolve("node_modules/tsx/dist/cli.mjs");
const tmpDir = resolve(`./.tmp-sync-${Date.now()}`);
const T = Date.UTC(2026, 9, 28, 10);

const dbFile = (name: string) => join(tmpDir, `${name}.sqlite`);
const exchangeFile = (name: string) => join(tmpDir, `${name}.quoin.json`);
const envFor = (name: string) => ({
  ...process.env,
  DATABASE_URL: `file:${dbFile(name)}`,
});

function run(name: string, script: string, ...args: string[]) {
  const result = spawnSync(execPath, [TSX, `scripts/${script}.ts`, ...args], {
    env: envFor(name),
    encoding: "utf8",
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function create(
  name: string,
  seed: (db: Database.Database, mark: (ms: number) => string) => void,
) {
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "ignore",
    env: envFor(name),
  });
  const db = new Database(dbFile(name));
  const { deviceId } = db
    .prepare(`SELECT "deviceId" FROM "SyncDevice"`)
    .get() as {
    deviceId: string;
  };
  const mark = (ms: number) => formatHlc({ ms, counter: 0, deviceId });
  seed(db, mark);
  db.prepare(`UPDATE "SyncDevice" SET "lastHlc" = ?`).run(mark(T));
  db.close();
}

const FUND = "IE00TEST0001";

function entry(
  db: Database.Database,
  externalId: string,
  grossAmount: string,
): void {
  db.prepare(
    `INSERT INTO "LedgerEntry" ("id", "ts", "type", "instrumentId", "quantity", "price", "grossAmount",
       "currency", "originalAmount", "originalCurrency", "account", "source", "externalId")
     VALUES (?, '2026-01-05T09:00:00.000+00:00', 'BUY', ?, '1', ?, ?, 'EUR', ?, 'EUR', 'trade-republic', 'TR_CSV', ?)`,
  ).run(
    `${externalId}-row`,
    FUND,
    grossAmount,
    grossAmount,
    grossAmount,
    externalId,
  );
}

function target(db: Database.Database, id: string, activeFrom: string): void {
  db.prepare(
    `INSERT INTO "PortfolioTarget" ("id", "name", "activeFrom", "createdAt")
     VALUES (?, ?, ?, '2026-10-01T10:00:00.000+00:00')`,
  ).run(id, id, activeFrom);
  db.prepare(
    `INSERT INTO "PortfolioTargetLine" ("id", "targetId", "instrumentId", "monthlyAmount")
     VALUES (?, ?, ?, '300')`,
  ).run(`${id}-line`, id, FUND);
}

function userState(name: string) {
  const exchange = JSON.parse(
    readFileSync(exchangeFile(name), "utf8"),
  ) as Record<string, unknown>;
  const {
    deviceId: _d,
    deviceName: _n,
    exportHlc: _e,
    peers: _p,
    ...state
  } = exchange;
  return state;
}

beforeAll(() => {
  mkdirSync(tmpDir, { recursive: true });
  create("a", (db, mark) => {
    db.prepare(
      `INSERT INTO "Instrument" ("id", "name", "type", "ter", "terHlc") VALUES (?, 'Test Fund', 'ETF', '0.0022', ?)`,
    ).run(FUND, mark(T - 1000));
    entry(db, "t-1", "100");
    target(db, "v0", "2026-06-01");
  });
  create("b", (db, mark) => {
    db.prepare(
      `INSERT INTO "Instrument" ("id", "name", "type", "thesis", "thesisHlc") VALUES (?, 'Test Fund', 'ETF', 'CONVICTION', ?)`,
    ).run(FUND, mark(T - 1000));
    entry(db, "t-2", "200");
    target(db, "v1", "2026-11-01");
    db.prepare(
      `INSERT INTO "SyncTombstone" ("entity", "key", "hlc") VALUES ('PortfolioTarget', 'v0', ?)`,
    ).run(mark(T - 500));
    db.prepare(
      `INSERT INTO "EtfHolding" ("id", "instrumentId", "identity", "identityKind", "name", "weight")
       VALUES ('h1', ?, 'US00TEST0101', 'ISIN', 'Alpha Corp', '0.6'), ('h2', ?, 'BETA.US', 'TICKER', 'Beta Inc', '0.4')`,
    ).run(FUND, FUND);
    db.prepare(
      `INSERT INTO "EtfHoldingBlock" ("instrumentId", "asOf", "asOfInferred", "hlc") VALUES (?, '2026-09-30', 0, ?)`,
    ).run(FUND, mark(T - 1000));
    db.prepare(
      `INSERT INTO "SecurityIdentity" ("identity", "identityKind", "canonicalId", "exchCode", "status", "source", "resolvedAt")
       VALUES ('US00TEST0101', 'ISIN', 'TESTFIGI0001', 'US', 'resolved', 'openfigi', '2026-10-01T10:00:00.000+00:00')`,
    ).run();
  });
}, 120_000);

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("sync round trip (integration)", () => {
  it("leaves two databases with different changes holding the same user state", () => {
    for (const [db, script, file, ...rest] of [
      ["a", "sync-export", "a1"],
      ["b", "sync-import", "a1"],
      ["b", "sync-export", "b1"],
      ["a", "sync-import", "b1"],
      ["a", "sync-export", "a2"],
      ["b", "sync-export", "b2"],
    ] as const) {
      const { status, output } = run(db, script, exchangeFile(file), ...rest);
      expect(status, `${script} ${file} on ${db}:\n${output}`).toBe(0);
    }

    const a = userState("a2");
    expect(a).toEqual(userState("b2"));
    expect(a).toMatchObject({
      ledger: [
        expect.objectContaining({ externalId: "t-1" }),
        expect.objectContaining({ externalId: "t-2" }),
      ],
      instruments: [
        expect.objectContaining({ ter: "0.0022", thesis: "CONVICTION" }),
      ],
      targets: [expect.objectContaining({ id: "v1" })],
      tombstones: [expect.objectContaining({ key: "v0" })],
      holdings: [expect.objectContaining({ asOf: "2026-09-30" })],
      identities: [expect.objectContaining({ identity: "US00TEST0101" })],
    });
  }, 120_000);

  it("finds nothing to do the second time, keeps only what it saw, and writes nothing on a dry run", () => {
    const peersOf = (name: string) => {
      const db = new Database(dbFile(name), { readonly: true });
      const rows = db
        .prepare(`SELECT * FROM "SyncPeer" ORDER BY "deviceId"`)
        .all();
      db.close();
      return rows;
    };

    const first = run("b", "sync-import", exchangeFile("a2"));
    expect(first.status, first.output).toBe(0);
    expect(first.output).toContain("Already up to date.");
    expect(first.output).not.toContain("Backup");
    const seen = peersOf("b");
    const again = run("b", "sync-import", exchangeFile("a2"));
    expect(again.output).toContain("Already up to date.");
    expect(peersOf("b")).toEqual(seen);

    const before = peersOf("a");
    const dry = run("a", "sync-import", exchangeFile("b2"), "--dry-run");
    expect(dry.status, dry.output).toBe(0);
    expect(peersOf("a")).toEqual(before);
  }, 120_000);

  it("refuses its own file, a file with a conflict, and an exchange name git does not ignore", () => {
    const own = run("a", "sync-import", exchangeFile("a2"));
    expect(own.status).toBe(1);
    expect(own.output).toContain("exported by this same database");

    const db = new Database(dbFile("b"));
    db.prepare(
      `UPDATE "LedgerEntry" SET "grossAmount" = '201' WHERE "externalId" = 't-2'`,
    ).run();
    db.close();
    run("b", "sync-export", exchangeFile("b3"));
    const conflicted = run("a", "sync-import", exchangeFile("b3"));
    expect(conflicted.status).toBe(1);
    expect(conflicted.output).toContain(
      "ledger entry TR_CSV::t-2: differs in grossAmount",
    );
    expect(conflicted.output).toContain("nothing was written");

    const exposed = run("a", "sync-export", join(tmpDir, "plain.json"));
    expect(exposed.status).toBe(1);
  }, 120_000);
});
