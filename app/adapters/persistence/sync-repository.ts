import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import Database from "better-sqlite3";

import { portfolioTargetSchema } from "~/core/domain";
import {
  INSTRUMENT_FIELDS,
  TARGET_ENTITY,
  tick,
  type HoldingsBlockRow,
  type InstrumentRow,
  type LocalDevice,
  type MergePlan,
  type Peer,
  type SyncState,
  type TargetRow,
} from "~/core/sync";

import { eventToCreateData, rowToEvent, rowToInstrument } from "./mappers";

export interface SyncSender {
  deviceId: string;
  name: string | null;
}

export interface SyncTx {
  read(): { device: LocalDevice; name: string | null };
  setLastHlc(mark: string): void;
  apply(plan: MergePlan["apply"], sender: SyncSender, nowMs: number): void;
  savePeers(peers: readonly Peer[], sender: SyncSender, nowMs: number): void;
  run(sql: string, ...params: unknown[]): void;
  all(sql: string, ...params: unknown[]): Record<string, unknown>[];
}

export class SyncBusyError extends Error {
  constructor(cause: unknown) {
    super(
      "The database is busy with another write; nothing was synced. Try again.",
      { cause },
    );
    this.name = "SyncBusyError";
  }
}

export interface SyncStore {
  transaction<T>(fn: (tx: SyncTx) => T): Promise<T>;
}

type SqlRow = Record<string, unknown>;

export const SYNC_COLUMNS = {
  Instrument: [
    "id",
    "name",
    "type",
    "assetClass",
    "quoteSymbol",
    "quoteSymbolHlc",
    "exposureKind",
    "exposureLeafId",
    "exposureHlc",
    "ter",
    "terHlc",
    "hedgedToBase",
    "hedgedToBaseHlc",
    "thesis",
    "thesisHlc",
    "priceSeriesVersion",
    "createdAt",
  ],
  LedgerEntry: [
    "id",
    "ts",
    "type",
    "instrumentId",
    "quantity",
    "price",
    "grossAmount",
    "fees",
    "taxWithheld",
    "currency",
    "fxSource",
    "fxDate",
    "fxRate",
    "fxDirection",
    "originalAmount",
    "originalCurrency",
    "valuationSource",
    "linkId",
    "linkKind",
    "funding",
    "account",
    "source",
    "externalId",
    "note",
    "createdAt",
  ],
  PortfolioTarget: ["id", "name", "activeFrom", "note", "createdAt"],
  PortfolioTargetLine: ["id", "targetId", "instrumentId", "monthlyAmount"],
  SyncTombstone: ["entity", "key", "hlc"],
  EtfHolding: [
    "id",
    "instrumentId",
    "identity",
    "identityKind",
    "name",
    "weight",
    "createdAt",
  ],
  EtfHoldingBlock: ["instrumentId", "asOf", "asOfInferred", "hlc"],
  SecurityIdentity: [
    "identity",
    "identityKind",
    "canonicalId",
    "exchCode",
    "status",
    "source",
    "resolvedAt",
  ],
  Settings: ["id", "residence", "residenceHlc"],
  SyncDevice: ["id", "deviceId", "name", "lastHlc"],
  SyncPeer: ["deviceId", "name", "seen", "lastSyncedAt"],
  PriceSnapshot: ["instrumentId", "asOf", "price", "currency", "source"],
} as const;

type Table = keyof typeof SYNC_COLUMNS;

const RETRY_DELAY_MS = 250;
const ONE = 1;

export const toDbInstant = (date: Date): string =>
  date.toISOString().replace("Z", "+00:00");

export function fromDbInstant(value: unknown): string {
  if (typeof value === "number" || typeof value === "bigint") {
    return new Date(Number(value)).toISOString();
  }
  if (typeof value === "string") {
    if (/^\d+$/.test(value)) return new Date(Number(value)).toISOString();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) {
      return new Date(`${value.replace(" ", "T")}Z`).toISOString();
    }
    if (/(Z|[+-]\d{2}:\d{2})$/.test(value)) {
      return new Date(value).toISOString();
    }
  }
  throw new Error(`Not a stored instant: ${JSON.stringify(value)}`);
}

const text = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);
const flag = (value: unknown): boolean => Number(value) === 1;

function databasePath(): string {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("file:")) {
    throw new Error("DATABASE_URL is not a file: URL");
  }
  return url.slice("file:".length);
}

export class SqliteSyncStore implements SyncStore {
  private db: Database.Database | null = null;

  constructor(private readonly path: string = databasePath()) {}

  async transaction<T>(fn: (tx: SyncTx) => T): Promise<T> {
    try {
      return this.run(fn);
    } catch (error) {
      if (!isBusy(error)) throw error;
      await sleep(RETRY_DELAY_MS);
      try {
        return this.run(fn);
      } catch (again) {
        if (!isBusy(again)) throw again;
        throw new SyncBusyError(again);
      }
    }
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  private run<T>(fn: (tx: SyncTx) => T): T {
    this.db ??= new Database(this.path, { fileMustExist: true, timeout: 0 });
    const db = this.db;
    return db.transaction(() => fn(new SqliteSyncTx(db))).immediate();
  }
}

function isBusy(error: unknown): boolean {
  return (
    error instanceof Database.SqliteError &&
    (error.code === "SQLITE_BUSY" || error.code.startsWith("SQLITE_BUSY_"))
  );
}

class SqliteSyncTx implements SyncTx {
  constructor(private readonly db: Database.Database) {}

  all(sql: string, ...params: unknown[]): SqlRow[] {
    return this.db.prepare(sql).all(...params) as SqlRow[];
  }

  private get(sql: string, ...params: unknown[]): SqlRow {
    const row = this.db.prepare(sql).get(...params) as SqlRow | undefined;
    if (!row) throw new Error(`No row for: ${sql}`);
    return row;
  }

  run(sql: string, ...params: unknown[]): void {
    this.db.prepare(sql).run(...params);
  }

  private insert(table: Table, data: SqlRow): void {
    const columns = Object.keys(data);
    const known: readonly string[] = SYNC_COLUMNS[table];
    for (const column of columns) {
      if (!known.includes(column)) {
        throw new Error(`The sync does not write ${table}.${column}`);
      }
    }
    this.run(
      `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      ...columns.map((c) => data[c]),
    );
  }

  read(): { device: LocalDevice; name: string | null } {
    const device = this.get(
      `SELECT "deviceId", "name", "lastHlc" FROM "SyncDevice" WHERE "id" = ?`,
      ONE,
    );
    const settings = this.get(
      `SELECT "residence", "residenceHlc" FROM "Settings" WHERE "id" = ?`,
      ONE,
    );
    const lines = this.all(
      `SELECT "targetId", "instrumentId", "monthlyAmount" FROM "PortfolioTargetLine" ORDER BY "instrumentId"`,
    );
    const holdings = this.all(
      `SELECT "instrumentId", "identity", "identityKind", "name", "weight" FROM "EtfHolding" ORDER BY "instrumentId", "identity"`,
    );

    const state: SyncState = {
      deviceId: String(device.deviceId),
      peers: this.all(
        `SELECT "deviceId", "seen" FROM "SyncPeer" ORDER BY "deviceId"`,
      ).map((p) => ({ deviceId: String(p.deviceId), seen: String(p.seen) })),
      ledger: this.all(
        `SELECT ${SYNC_COLUMNS.LedgerEntry.filter(
          (c) => c !== "id" && c !== "createdAt",
        )
          .map((c) => `"${c}"`)
          .join(", ")} FROM "LedgerEntry" ORDER BY "source", "externalId"`,
      ).map((row) => ({
        source: String(row.source),
        externalId: text(row.externalId) ?? "",
        ts: fromDbInstant(row.ts),
        type: String(row.type) as SyncState["ledger"][number]["type"],
        instrumentId: text(row.instrumentId),
        quantity: text(row.quantity),
        price: text(row.price),
        grossAmount: String(row.grossAmount),
        fees: String(row.fees),
        taxWithheld: String(row.taxWithheld),
        currency: String(row.currency),
        fxSource: String(row.fxSource),
        fxDate: text(row.fxDate),
        fxRate: text(row.fxRate),
        fxDirection: text(row.fxDirection),
        originalAmount: text(row.originalAmount),
        originalCurrency: text(row.originalCurrency),
        valuationSource: text(row.valuationSource),
        linkId: text(row.linkId),
        linkKind: text(row.linkKind),
        funding: String(row.funding) as SyncState["ledger"][number]["funding"],
        account: String(row.account),
        note: text(row.note),
      })),
      instruments: this.all(`SELECT * FROM "Instrument" ORDER BY "id"`).map(
        (row): InstrumentRow => ({
          id: String(row.id),
          name: String(row.name),
          type: String(row.type),
          assetClass: text(row.assetClass),
          quoteSymbol: text(row.quoteSymbol),
          quoteSymbolHlc: text(row.quoteSymbolHlc),
          exposureKind: text(row.exposureKind),
          exposureLeafId: text(row.exposureLeafId),
          exposureHlc: text(row.exposureHlc),
          ter: text(row.ter),
          terHlc: text(row.terHlc),
          hedgedToBase: flag(row.hedgedToBase),
          hedgedToBaseHlc: text(row.hedgedToBaseHlc),
          thesis: String(row.thesis),
          thesisHlc: text(row.thesisHlc),
        }),
      ),
      targets: this.all(
        `SELECT "id", "name", "activeFrom", "note", "createdAt" FROM "PortfolioTarget" ORDER BY "id"`,
      ).map(
        (t): TargetRow => ({
          id: String(t.id),
          name: String(t.name),
          activeFrom: text(t.activeFrom) ?? "",
          note: text(t.note),
          createdAt: fromDbInstant(t.createdAt),
          lines: lines
            .filter((l) => l.targetId === t.id)
            .map((l) => ({
              instrumentId: String(l.instrumentId),
              monthlyAmount: String(l.monthlyAmount),
            })),
        }),
      ),
      tombstones: this.all(
        `SELECT "key", "hlc" FROM "SyncTombstone" ORDER BY "entity", "key"`,
      ).map((t) => ({
        entity: TARGET_ENTITY,
        key: String(t.key),
        hlc: String(t.hlc),
      })),
      holdings: this.all(
        `SELECT "instrumentId", "asOf", "asOfInferred", "hlc" FROM "EtfHoldingBlock" ORDER BY "instrumentId"`,
      ).map(
        (b): HoldingsBlockRow => ({
          instrumentId: String(b.instrumentId),
          asOf: String(b.asOf),
          asOfInferred: flag(b.asOfInferred),
          hlc: text(b.hlc),
          rows: holdings
            .filter((h) => h.instrumentId === b.instrumentId)
            .map((h) => ({
              identity: String(h.identity),
              identityKind: String(h.identityKind) as "ISIN" | "TICKER",
              name: String(h.name),
              weight: String(h.weight),
            })),
        }),
      ),
      identities: this.all(
        `SELECT * FROM "SecurityIdentity" ORDER BY "identity"`,
      ).map((i) => ({
        identity: String(i.identity),
        identityKind: String(i.identityKind) as "ISIN" | "TICKER",
        canonicalId: text(i.canonicalId),
        exchCode: text(i.exchCode),
        status: String(i.status) as "resolved" | "not-found" | "ambiguous",
        source: String(i.source),
        resolvedAt: fromDbInstant(i.resolvedAt),
      })),
      settings: {
        residence: String(settings.residence),
        residenceHlc: text(settings.residenceHlc),
      },
    };
    return {
      device: { state, lastHlc: text(device.lastHlc) },
      name: text(device.name),
    };
  }

  setLastHlc(mark: string): void {
    this.run(`UPDATE "SyncDevice" SET "lastHlc" = ? WHERE "id" = ?`, mark, ONE);
  }

  apply(plan: MergePlan["apply"], sender: SyncSender, nowMs: number): void {
    const now = toDbInstant(new Date(nowMs));
    const device = this.get(
      `SELECT "deviceId", "lastHlc" FROM "SyncDevice" WHERE "id" = ?`,
      ONE,
    );
    const deviceId = String(device.deviceId);
    let last = text(device.lastHlc);
    const fresh = () => (last = tick(last, nowMs, deviceId));

    for (const row of plan.instruments.insert) {
      rowToInstrument(row);
      this.insert("Instrument", {
        ...row,
        hedgedToBase: row.hedgedToBase ? 1 : 0,
        createdAt: now,
      });
    }
    for (const { id, patch } of plan.instruments.update) {
      const current = this.get(`SELECT * FROM "Instrument" WHERE "id" = ?`, id);
      rowToInstrument({
        id,
        name: String(current.name),
        type: String(current.type),
        assetClass: text(current.assetClass),
        quoteSymbol: text(current.quoteSymbol),
        exposureKind: text(current.exposureKind),
        exposureLeafId: text(current.exposureLeafId),
        ter: text(current.ter),
        hedgedToBase: flag(current.hedgedToBase),
        thesis: String(current.thesis),
        ...patch,
      });
      const columns = Object.keys(patch);
      for (const column of columns) {
        if (!(SYNC_COLUMNS.Instrument as readonly string[]).includes(column)) {
          throw new Error(`The sync does not write Instrument.${column}`);
        }
      }
      const values = columns.map((c) => {
        const value = (patch as SqlRow)[c];
        return typeof value === "boolean" ? (value ? 1 : 0) : value;
      });
      this.run(
        `UPDATE "Instrument" SET ${columns.map((c) => `"${c}" = ?`).join(", ")} WHERE "id" = ?`,
        ...values,
        id,
      );
      if ("quoteSymbol" in patch) {
        this.run(`DELETE FROM "PriceSnapshot" WHERE "instrumentId" = ?`, id);
        this.run(
          `UPDATE "Instrument" SET "priceSeriesVersion" = ? WHERE "id" = ?`,
          randomUUID(),
          id,
        );
      }
    }

    for (const row of plan.ledger.insert) {
      const data = eventToCreateData(
        rowToEvent({ ...row, id: randomUUID(), ts: new Date(row.ts) }),
      );
      this.insert("LedgerEntry", {
        ...data,
        ts: toDbInstant(data.ts),
        createdAt: now,
      });
    }
    for (const key of plan.ledger.markInKind) {
      const [source, externalId] = splitKey(key);
      this.run(
        `UPDATE "LedgerEntry" SET "funding" = 'IN_KIND' WHERE "source" = ? AND "externalId" = ? AND "funding" = 'CASH'`,
        source,
        externalId,
      );
    }

    for (const id of plan.targets.delete) {
      this.run(`DELETE FROM "PortfolioTargetLine" WHERE "targetId" = ?`, id);
      this.run(`DELETE FROM "PortfolioTarget" WHERE "id" = ?`, id);
    }
    for (const target of plan.targets.insert) this.insertTarget(target);
    for (const tombstone of plan.tombstones) {
      this.insert("SyncTombstone", { ...tombstone });
    }

    for (const block of plan.holdings) this.replaceBlock(block, now);

    for (const { resolvedAt, ...row } of plan.identities) {
      const data: SqlRow = {
        ...row,
        resolvedAt: toDbInstant(new Date(resolvedAt)),
      };
      const columns = Object.keys(data);
      this.run(
        `INSERT INTO "SecurityIdentity" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})
         ON CONFLICT("identity") DO UPDATE SET ${columns
           .filter((c) => c !== "identity")
           .map((c) => `"${c}" = excluded."${c}"`)
           .join(", ")}`,
        ...columns.map((c) => data[c]),
      );
    }

    if (plan.settings) {
      const { residence, residenceHlc } = plan.settings;
      if (residence !== undefined) {
        this.run(
          `UPDATE "Settings" SET "residence" = ? WHERE "id" = ?`,
          residence,
          ONE,
        );
      }
      if (residenceHlc !== undefined) {
        this.run(
          `UPDATE "Settings" SET "residenceHlc" = ? WHERE "id" = ?`,
          residenceHlc,
          ONE,
        );
      }
    }

    for (const restamp of plan.restamp) {
      switch (restamp.kind) {
        case "instrument":
          this.run(
            `UPDATE "Instrument" SET "${INSTRUMENT_FIELDS[restamp.field].mark}" = ? WHERE "id" = ?`,
            fresh(),
            restamp.id,
          );
          break;
        case "settings":
          this.run(
            `UPDATE "Settings" SET "residenceHlc" = ? WHERE "id" = ?`,
            fresh(),
            ONE,
          );
          break;
        case "holdings":
          this.run(
            `UPDATE "EtfHoldingBlock" SET "hlc" = ? WHERE "instrumentId" = ?`,
            fresh(),
            restamp.instrumentId,
          );
          break;
        case "tombstone":
          this.insert("SyncTombstone", {
            entity: TARGET_ENTITY,
            key: restamp.key,
            hlc: fresh(),
          });
          break;
        case "reissue": {
          const mark = fresh();
          this.insert("SyncTombstone", {
            entity: TARGET_ENTITY,
            key: restamp.target.id,
            hlc: mark,
          });
          this.insertTarget({ ...restamp.target, id: mark });
          break;
        }
      }
    }
    if (last !== null && last !== text(device.lastHlc)) this.setLastHlc(last);

    this.savePeers(plan.peers, sender, nowMs);
  }

  savePeers(peers: readonly Peer[], sender: SyncSender, nowMs: number): void {
    for (const { deviceId, seen } of peers) {
      if (deviceId === sender.deviceId) {
        this.run(
          `INSERT INTO "SyncPeer" ("deviceId", "name", "seen", "lastSyncedAt") VALUES (?, ?, ?, ?)
           ON CONFLICT("deviceId") DO UPDATE SET "name" = excluded."name", "seen" = excluded."seen", "lastSyncedAt" = excluded."lastSyncedAt"`,
          deviceId,
          sender.name,
          seen,
          toDbInstant(new Date(nowMs)),
        );
      } else {
        this.run(
          `INSERT INTO "SyncPeer" ("deviceId", "seen") VALUES (?, ?)
           ON CONFLICT("deviceId") DO UPDATE SET "seen" = excluded."seen"`,
          deviceId,
          seen,
        );
      }
    }
  }

  private insertTarget(target: TargetRow): void {
    const parsed = portfolioTargetSchema.parse({
      ...target,
      createdAt: new Date(target.createdAt),
    });
    this.insert("PortfolioTarget", {
      id: parsed.id,
      name: parsed.name,
      activeFrom: parsed.activeFrom,
      note: parsed.note ?? null,
      createdAt: toDbInstant(parsed.createdAt),
    });
    for (const line of parsed.lines) {
      this.insert("PortfolioTargetLine", {
        id: randomUUID(),
        targetId: parsed.id,
        instrumentId: line.instrumentId,
        monthlyAmount: line.monthlyAmount,
      });
    }
  }

  private replaceBlock(block: HoldingsBlockRow, now: string): void {
    const { instrumentId, rows, asOf, asOfInferred, hlc } = block;
    this.run(`DELETE FROM "EtfHolding" WHERE "instrumentId" = ?`, instrumentId);
    for (const row of rows) {
      this.insert("EtfHolding", {
        id: randomUUID(),
        instrumentId,
        ...row,
        createdAt: now,
      });
    }
    this.run(
      `INSERT INTO "EtfHoldingBlock" ("instrumentId", "asOf", "asOfInferred", "hlc") VALUES (?, ?, ?, ?)
       ON CONFLICT("instrumentId") DO UPDATE SET "asOf" = excluded."asOf", "asOfInferred" = excluded."asOfInferred", "hlc" = excluded."hlc"`,
      instrumentId,
      asOf,
      asOfInferred ? 1 : 0,
      hlc,
    );
  }
}

function splitKey(key: string): [string, string] {
  const at = key.indexOf("::");
  return [key.slice(0, at), key.slice(at + 2)];
}
