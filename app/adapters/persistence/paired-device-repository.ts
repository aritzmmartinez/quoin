import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

import type { StoredPrices } from "~/core/sync";

import { prisma } from "./db.server";
import { fromDbInstant, toDbInstant, type SyncTx } from "./sync-repository";

export const DEFAULT_SYNC_PORT = 3443;
const SERVER_ID = 1;
const READ_TIMEOUT_MS = 1000;

export interface PairedDevice {
  deviceId: string;
  name: string;
  tokenHash: string;
  pairedAt: Date;
  lastSyncAt: Date | null;
  lastAddress: string | null;
  lastCounts: string | null;
  revokedAt: Date | null;
}

export interface SyncServerAddress {
  host: string | null;
  port: number;
}

export class PrismaPairedDeviceRepository {
  list(): Promise<PairedDevice[]> {
    return prisma.pairedDevice.findMany({ orderBy: { pairedAt: "asc" } });
  }

  async revoke(deviceId: string, now: Date): Promise<void> {
    await prisma.$transaction((tx) =>
      tx.pairedDevice.updateMany({
        where: { deviceId, revokedAt: null },
        data: { revokedAt: now },
      }),
    );
  }

  async address(): Promise<SyncServerAddress> {
    const row = await prisma.syncServer.findUnique({
      where: { id: SERVER_ID },
    });
    return { host: row?.host ?? null, port: row?.port ?? DEFAULT_SYNC_PORT };
  }

  async setAddress(address: SyncServerAddress): Promise<void> {
    await prisma.$transaction((tx) =>
      tx.syncServer.upsert({
        where: { id: SERVER_ID },
        create: { id: SERVER_ID, ...address },
        update: address,
      }),
    );
  }
}

const orNull = (value: unknown): Date | null =>
  value === null || value === undefined ? null : new Date(fromDbInstant(value));

export class SqlitePairedDevices {
  constructor(private readonly path: string) {}

  private read<T>(fn: (db: Database.Database) => T): T {
    const db = new Database(this.path, {
      readonly: true,
      fileMustExist: true,
      timeout: READ_TIMEOUT_MS,
    });
    try {
      return fn(db);
    } finally {
      db.close();
    }
  }

  find(deviceId: string): PairedDevice | null {
    const row = this.read(
      (db) =>
        db
          .prepare(`SELECT * FROM "PairedDevice" WHERE "deviceId" = ?`)
          .get(deviceId) as Record<string, unknown> | undefined,
    );
    if (!row) return null;
    return {
      deviceId: String(row.deviceId),
      name: String(row.name),
      tokenHash: String(row.tokenHash),
      pairedAt: new Date(fromDbInstant(row.pairedAt)),
      lastSyncAt: orNull(row.lastSyncAt),
      lastAddress: row.lastAddress === null ? null : String(row.lastAddress),
      lastCounts: row.lastCounts === null ? null : String(row.lastCounts),
      revokedAt: orNull(row.revokedAt),
    };
  }

  hasActive(): boolean {
    return this.read(
      (db) =>
        db
          .prepare(
            `SELECT 1 FROM "PairedDevice" WHERE "revokedAt" IS NULL LIMIT 1`,
          )
          .get() !== undefined,
    );
  }
}

export function savePairedDevice(
  tx: SyncTx,
  device: { deviceId: string; name: string; tokenHash: string },
  now: Date,
): void {
  tx.run(
    `INSERT INTO "PairedDevice" ("deviceId", "name", "tokenHash", "pairedAt")
     VALUES (?, ?, ?, ?)
     ON CONFLICT ("deviceId") DO UPDATE SET
       "name" = excluded."name",
       "tokenHash" = excluded."tokenHash",
       "pairedAt" = excluded."pairedAt",
       "lastSyncAt" = NULL,
       "lastAddress" = NULL,
       "lastCounts" = NULL,
       "revokedAt" = NULL`,
    device.deviceId,
    device.name,
    device.tokenHash,
    toDbInstant(now),
  );
}

export function recordDeviceSync(
  tx: SyncTx,
  deviceId: string,
  sync: { at: Date; address: string; counts: string },
): void {
  tx.run(
    `UPDATE "PairedDevice" SET "lastSyncAt" = ?, "lastAddress" = ?, "lastCounts" = ?
      WHERE "deviceId" = ?`,
    toDbInstant(sync.at),
    sync.address,
    sync.counts,
    deviceId,
  );
}

export function readStoredPrices(
  tx: SyncTx,
  instrumentIds: readonly string[],
): Map<string, StoredPrices> {
  const found = new Map<string, StoredPrices>();
  for (const id of instrumentIds) {
    const [instrument] = tx.all(
      `SELECT "priceSeriesVersion" FROM "Instrument" WHERE "id" = ?`,
      id,
    );
    if (!instrument) continue;

    let seriesVersion = instrument.priceSeriesVersion as string | null;
    if (seriesVersion === null) {
      seriesVersion = randomUUID();
      tx.run(
        `UPDATE "Instrument" SET "priceSeriesVersion" = ? WHERE "id" = ?`,
        seriesVersion,
        id,
      );
    }

    const rows = tx.all(
      `SELECT "asOf", "price", "currency", "source" FROM "PriceSnapshot"
        WHERE "instrumentId" = ? ORDER BY "asOf" ASC`,
      id,
    );
    found.set(id, {
      seriesVersion,
      rows: rows.map((row) => ({
        asOf: fromDbInstant(row.asOf),
        price: String(row.price),
        currency: String(row.currency),
        source: String(row.source),
      })),
    });
  }
  return found;
}
