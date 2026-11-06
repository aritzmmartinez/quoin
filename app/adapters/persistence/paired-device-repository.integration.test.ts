import { mkdirSync, rmSync } from "node:fs";

import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migratedDatabase } from "../../../test/integration/template";

let persistence: typeof import("./index");
let store: import("./index").SqliteSyncStore;
let devices: import("./index").SqlitePairedDevices;
let repo: import("./index").PrismaPairedDeviceRepository;

const tmpDir = "./.tmp-paired-devices";
const dbPath = `${tmpDir}/it-${Date.now()}.sqlite`;
const T = new Date("2026-11-06T10:00:00.000Z");
const device = { deviceId: "dev-phone", name: "Phone", tokenHash: "hash-1" };

beforeAll(async () => {
  mkdirSync(tmpDir, { recursive: true });
  process.env.DATABASE_URL = `file:${dbPath}`;
  migratedDatabase(dbPath);
  persistence = await import("./index");
  store = new persistence.SqliteSyncStore(dbPath);
  devices = new persistence.SqlitePairedDevices(dbPath);
  repo = new persistence.PrismaPairedDeviceRepository();
});

afterAll(async () => {
  store?.close();
  await persistence?.prisma.$disconnect();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("paired devices (integration)", () => {
  it("starts with nothing active", () => {
    expect(devices.hasActive()).toBe(false);
    expect(devices.find(device.deviceId)).toBeNull();
  });

  it("stores a device on the sync's connection and reads it on Prisma's", async () => {
    await store.transaction((tx) =>
      persistence.savePairedDevice(tx, device, T),
    );

    expect(devices.find(device.deviceId)).toMatchObject({
      ...device,
      pairedAt: T,
      lastSyncAt: null,
      revokedAt: null,
    });
    expect(devices.hasActive()).toBe(true);
    expect(await repo.list()).toMatchObject([{ ...device, pairedAt: T }]);
  });

  it("records a sync inside the sync's transaction", async () => {
    const at = new Date(T.getTime() + 1000);
    await store.transaction((tx) =>
      persistence.recordDeviceSync(tx, device.deviceId, {
        at,
        address: "192.168.1.30",
        counts: '{"ledger":1}',
      }),
    );

    expect(devices.find(device.deviceId)).toMatchObject({
      lastSyncAt: at,
      lastAddress: "192.168.1.30",
      lastCounts: '{"ledger":1}',
    });
    expect((await repo.list())[0]?.lastSyncAt).toEqual(at);
  });

  it("revokes through Prisma, keeping the first revocation's date", async () => {
    await repo.revoke(device.deviceId, T);
    await repo.revoke(device.deviceId, new Date(T.getTime() + 5000));

    expect(devices.find(device.deviceId)?.revokedAt).toEqual(T);
    expect(devices.hasActive()).toBe(false);
  });

  it("pairing again starts the device afresh", async () => {
    const later = new Date(T.getTime() + 9000);
    await store.transaction((tx) =>
      persistence.savePairedDevice(
        tx,
        { ...device, tokenHash: "hash-2" },
        later,
      ),
    );

    expect(devices.find(device.deviceId)).toMatchObject({
      tokenHash: "hash-2",
      pairedAt: later,
      lastSyncAt: null,
      lastCounts: null,
      revokedAt: null,
    });
  });

  it("stays out of the exchange", async () => {
    const state = await store.transaction((tx) => tx.read().device.state);
    expect(JSON.stringify(state)).not.toContain("dev-phone");
    expect(Object.keys(persistence.SYNC_COLUMNS)).not.toContain("PairedDevice");
    expect(Object.keys(persistence.SYNC_COLUMNS)).not.toContain("SyncServer");
  });
});

describe("the sync server's address (integration)", () => {
  it("has the default port and no host until one is saved", async () => {
    await expect(repo.address()).resolves.toEqual({ host: null, port: 3443 });
  });

  it("keeps one row however many times it is saved", async () => {
    await repo.setAddress({ host: "192.168.1.20", port: 3443 });
    await repo.setAddress({ host: "192.168.1.21", port: 4443 });

    await expect(repo.address()).resolves.toEqual({
      host: "192.168.1.21",
      port: 4443,
    });
  });

  it("refuses a second row at the database", () => {
    const db = new Database(dbPath);
    try {
      expect(() =>
        db.exec(`INSERT INTO "SyncServer" ("id", "port") VALUES (2, 1)`),
      ).toThrow(/CHECK/);
    } finally {
      db.close();
    }
  });
});

describe("SqlitePriceReader (integration)", () => {
  it("reads rows oldest first as instants, and the instrument's symbol", async () => {
    await new persistence.PrismaInstrumentRepository().upsert([
      { id: "IE00TEST0001", name: "Fund", type: "ETF", thesis: "CORE" },
    ]);
    await new persistence.PrismaInstrumentRepository().setQuoteSymbol(
      "IE00TEST0001",
      "TEST.DE",
    );
    const row = (asOf: string, price: string) => ({
      instrumentId: "IE00TEST0001",
      price,
      currency: "EUR",
      asOf: new Date(asOf),
      source: "YAHOO",
    });
    await new persistence.PrismaPriceRepository().saveMany([
      row("2026-10-14T07:00:00Z", "11"),
      row("2026-10-13T07:00:00Z", "10"),
    ]);

    const read = new persistence.SqlitePriceReader(dbPath).read([
      "IE00TEST0001",
      "UNKNOWN",
    ]);

    expect(read.get("IE00TEST0001")).toEqual({
      quoteSymbol: "TEST.DE",
      rows: [
        {
          asOf: "2026-10-13T07:00:00.000Z",
          price: "10",
          currency: "EUR",
          source: "YAHOO",
        },
        {
          asOf: "2026-10-14T07:00:00.000Z",
          price: "11",
          currency: "EUR",
          source: "YAHOO",
        },
      ],
    });
    expect(read.get("UNKNOWN")).toEqual({ quoteSymbol: null, rows: [] });
  });
});
