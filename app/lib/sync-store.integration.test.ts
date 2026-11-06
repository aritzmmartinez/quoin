import { mkdirSync, rmSync } from "node:fs";

import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migratedDatabase } from "../../test/integration/template";

import {
  applyPlan,
  exchangeSchema,
  formatHlc,
  merge,
  type LocalDevice,
} from "~/core/sync";
import { importState } from "./sync";

let persistence: typeof import("~/adapters/persistence");
let store: import("~/adapters/persistence").SqliteSyncStore;

const tmpDir = "./.tmp-sync-store";
const dbPath = `${tmpDir}/it-${Date.now()}.sqlite`;
const FUND = "IE00TEST0001";
const PHONE = "dev-phone";
const T = Date.UTC(2026, 9, 28, 10);
const mark = (deviceId: string, ms: number) =>
  formatHlc({ ms, counter: 0, deviceId });

const PINNED: Record<string, Record<string, string>> = {
  Instrument: {
    id: "TEXT!",
    name: "TEXT!",
    type: "TEXT!",
    assetClass: "TEXT",
    quoteSymbol: "TEXT",
    quoteSymbolHlc: "TEXT",
    exposureKind: "TEXT",
    exposureLeafId: "TEXT",
    exposureHlc: "TEXT",
    ter: "TEXT",
    terHlc: "TEXT",
    hedgedToBase: "BOOLEAN!",
    hedgedToBaseHlc: "TEXT",
    thesis: "TEXT!",
    thesisHlc: "TEXT",
    createdAt: "DATETIME!",
  },
  LedgerEntry: {
    id: "TEXT!",
    ts: "DATETIME!",
    type: "TEXT!",
    instrumentId: "TEXT",
    quantity: "TEXT",
    price: "TEXT",
    grossAmount: "TEXT!",
    fees: "TEXT!",
    taxWithheld: "TEXT!",
    currency: "TEXT!",
    fxSource: "TEXT!",
    fxDate: "TEXT",
    fxRate: "TEXT",
    fxDirection: "TEXT",
    originalAmount: "TEXT",
    originalCurrency: "TEXT",
    valuationSource: "TEXT",
    linkId: "TEXT",
    linkKind: "TEXT",
    funding: "TEXT!",
    account: "TEXT!",
    source: "TEXT!",
    externalId: "TEXT",
    note: "TEXT",
    createdAt: "DATETIME!",
  },
  PortfolioTarget: {
    id: "TEXT!",
    name: "TEXT!",
    activeFrom: "TEXT",
    note: "TEXT",
    createdAt: "DATETIME!",
  },
  PortfolioTargetLine: {
    id: "TEXT!",
    targetId: "TEXT!",
    instrumentId: "TEXT!",
    monthlyAmount: "TEXT!",
  },
  SyncTombstone: { entity: "TEXT!", key: "TEXT!", hlc: "TEXT!" },
  EtfHolding: {
    id: "TEXT!",
    instrumentId: "TEXT!",
    identity: "TEXT!",
    identityKind: "TEXT!",
    name: "TEXT!",
    weight: "TEXT!",
    createdAt: "DATETIME!",
  },
  EtfHoldingBlock: {
    instrumentId: "TEXT!",
    asOf: "TEXT!",
    asOfInferred: "BOOLEAN!",
    hlc: "TEXT",
  },
  SecurityIdentity: {
    identity: "TEXT!",
    identityKind: "TEXT!",
    canonicalId: "TEXT",
    exchCode: "TEXT",
    status: "TEXT!",
    source: "TEXT!",
    resolvedAt: "DATETIME!",
  },
  Settings: { id: "INTEGER!", residence: "TEXT!", residenceHlc: "TEXT" },
  SyncDevice: {
    id: "INTEGER!",
    deviceId: "TEXT!",
    name: "TEXT",
    lastHlc: "TEXT",
  },
  SyncPeer: {
    deviceId: "TEXT!",
    name: "TEXT",
    seen: "TEXT!",
    lastSyncedAt: "DATETIME",
  },
  PriceSnapshot: {
    instrumentId: "TEXT!",
    asOf: "DATETIME!",
    price: "TEXT!",
    currency: "TEXT!",
    source: "TEXT!",
  },
};

beforeAll(async () => {
  mkdirSync(tmpDir, { recursive: true });
  const dbUrl = `file:${dbPath}`;
  process.env.DATABASE_URL = dbUrl;
  migratedDatabase(dbPath);
  persistence = await import("~/adapters/persistence");
  store = new persistence.SqliteSyncStore();
  await new persistence.PrismaInstrumentRepository().upsert([
    { id: FUND, name: "Test Fund", type: "ETF", thesis: "CORE" },
  ]);
});

afterAll(async () => {
  store?.close();
  if (persistence) await persistence.prisma.$disconnect();
  rmSync(tmpDir, { recursive: true, force: true });
});

const read = () => store.transaction((tx) => tx.read().device);
const noEffects = async () => {
  throw new Error("no effect expected");
};

describe("a database busy with another write (integration)", () => {
  it("says so with a type of its own, after one retry", async () => {
    const other = new Database(dbPath);
    other.exec("BEGIN IMMEDIATE");
    try {
      await expect(read()).rejects.toBeInstanceOf(persistence.SyncBusyError);
    } finally {
      other.exec("ROLLBACK");
      other.close();
    }
    await expect(read()).resolves.toBeDefined();
  });
});

function buy(externalId: string, grossAmount = "100") {
  return {
    source: "TR_CSV",
    externalId,
    ts: "2026-01-05T09:00:00.000Z",
    type: "BUY",
    instrumentId: FUND,
    quantity: "1",
    price: grossAmount,
    grossAmount,
    currency: "EUR",
    originalAmount: grossAmount,
    originalCurrency: "EUR",
    account: "trade-republic",
  };
}

async function phoneFile(
  exportMs: number,
  extra: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { state } = await read();
  return {
    schemaVersion: 1,
    deviceId: PHONE,
    deviceName: "phone",
    exportHlc: mark(PHONE, exportMs),
    settings: { residence: "bizkaia", residenceHlc: null },
    instruments: state.instruments,
    peers: [
      {
        deviceId: state.deviceId,
        seen: (await read()).lastHlc ?? mark(state.deviceId, 1),
      },
    ],
    ...extra,
  };
}

function holdWriteLock(write: (tx: unknown) => Promise<unknown>) {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let locked = () => {};
  const isLocked = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const done = persistence.prisma.$transaction(async (tx) => {
    await write(tx);
    locked();
    await gate;
  });
  return { isLocked, release, done };
}

describe("the sync's own SQL (integration)", () => {
  it("reads and writes only columns the migrations still have, with the types it expects", () => {
    const db = new Database(dbPath, { readonly: true });
    try {
      for (const [table, columns] of Object.entries(persistence.SYNC_COLUMNS)) {
        const info = db.prepare(`PRAGMA table_info("${table}")`).all() as {
          name: string;
          type: string;
          notnull: number;
        }[];
        const actual = new Map(
          info.map((c) => [c.name, `${c.type}${c.notnull ? "!" : ""}`]),
        );
        const pinned = PINNED[table] ?? {};
        for (const column of columns) {
          expect(
            pinned[column],
            `${table}.${column} is not pinned`,
          ).toBeDefined();
          expect(actual.get(column), `${table}.${column}`).toBe(pinned[column]);
        }
      }
    } finally {
      db.close();
    }
  });

  it("writes every NOT NULL column of a table it inserts into", () => {
    const db = new Database(dbPath, { readonly: true });
    try {
      for (const table of [
        "Instrument",
        "LedgerEntry",
        "PortfolioTarget",
        "PortfolioTargetLine",
        "SyncTombstone",
        "EtfHolding",
        "EtfHoldingBlock",
        "SecurityIdentity",
        "SyncPeer",
      ] as const) {
        const written: readonly string[] = persistence.SYNC_COLUMNS[table];
        const required = (
          db.prepare(`PRAGMA table_info("${table}")`).all() as {
            name: string;
            notnull: number;
            dflt_value: unknown;
          }[]
        ).filter((c) => c.notnull && c.dflt_value === null);
        for (const column of required) {
          expect(written, `${table}.${column.name}`).toContain(column.name);
        }
      }
    } finally {
      db.close();
    }
  });

  it("waits for a write the app holds open, then keeps both", async () => {
    const file = await phoneFile(T, { ledger: [buy("remote-1")] });
    const lock = holdWriteLock((tx) =>
      (tx as typeof persistence.prisma).ledgerEntry.create({
        data: {
          id: "local-row",
          ts: new Date(T),
          type: "DEPOSIT",
          grossAmount: "50",
          currency: "EUR",
          originalAmount: "50",
          originalCurrency: "EUR",
          source: "TR_CSV",
          externalId: "local-1",
        },
      }),
    );
    await lock.isLocked;
    const importing = importState(
      { store, runEffect: noEffects, now: new Date(T + 1000) },
      file,
      { dryRun: false },
    );
    setTimeout(lock.release, 50);
    await lock.done;
    expect((await importing).status).toBe("applied");

    const keys = (await read()).state.ledger.map((row) => row.externalId);
    expect(keys).toEqual(expect.arrayContaining(["local-1", "remote-1"]));
  });

  it("plans against a change committed while it waited, instead of overwriting it", async () => {
    const before = await read();
    const file = await phoneFile(T + 2000, {
      instruments: before.state.instruments.map((i) =>
        i.id === FUND
          ? { ...i, ter: "0.0030", terHlc: mark(PHONE, T + 2000) }
          : i,
      ),
    });
    const { stamp } = await import("~/adapters/persistence/hlc");
    const lock = holdWriteLock(async (tx) => {
      const client = tx as Parameters<typeof stamp>[0];
      await client.instrument.update({
        where: { id: FUND },
        data: { ter: "0.0022", terHlc: await stamp(client) },
      });
    });
    await lock.isLocked;
    const importing = importState(
      { store, runEffect: noEffects, now: new Date(T + 3000) },
      file,
      { dryRun: false },
    );
    setTimeout(lock.release, 50);
    await lock.done;

    const result = await importing;
    expect(result.status).toBe("conflicts");
    expect(result.plan.conflicts).toEqual([
      expect.objectContaining({ field: "ter", local: "0.0022" }),
    ]);
    const fund = (await read()).state.instruments.find((i) => i.id === FUND);
    expect(fund?.ter).toBe("0.0022");
  });

  it("writes exactly what applyPlan says, resolutions and set-aside rows included", async () => {
    await persistence.prisma.$transaction((tx) =>
      tx.portfolioTarget.create({
        data: {
          id: "v-here",
          name: "here",
          activeFrom: "2026-12-01",
          createdAt: new Date(T),
        },
      }),
    );
    const before: LocalDevice = await read();
    const file = exchangeSchema.parse(
      await phoneFile(T + 4000, {
        instruments: before.state.instruments.map((i) =>
          i.id === FUND
            ? { ...i, ter: "0.0030", terHlc: mark(PHONE, T + 4000) }
            : i,
        ),
        settings: { residence: "araba", residenceHlc: null },
        ledger: [buy("remote-1", "999"), buy("remote-2", "120")],
        targets: [
          {
            id: "v-there",
            name: "there",
            activeFrom: "2026-12-01",
            note: null,
            createdAt: new Date(T).toISOString(),
            lines: [{ instrumentId: FUND, monthlyAmount: "300" }],
          },
        ],
        peers: [
          {
            deviceId: before.state.deviceId,
            seen: mark(before.state.deviceId, 1),
          },
        ],
      }),
    );
    const resolutions = new Map([
      [`instrument:${FUND}:ter`, "keep" as const],
      ["settings:residence", "keep" as const],
      ["target-day:2026-12-01", "take" as const],
    ]);
    const nowMs = T + 5000;
    const plan = merge(before.state, file, resolutions);
    expect(plan.conflicts).toEqual([]);
    expect(plan.setAside.map((row) => row.key)).toEqual(["TR_CSV::remote-1"]);

    const result = await importState(
      { store, runEffect: noEffects, now: new Date(nowMs) },
      file,
      { dryRun: false, resolutions },
    );
    expect(result.status).toBe("applied");

    const expected = applyPlan(before, plan.apply, nowMs);
    expect(await read()).toEqual(expected);
  });
});
