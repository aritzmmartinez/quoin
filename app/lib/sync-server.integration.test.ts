import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import type { TLSSocket } from "node:tls";
import { join, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SqliteSyncStore } from "~/adapters/persistence";
import { today } from "~/core/calendar";
import type { Effect } from "~/core/sync";

import { migratedDatabase } from "../../test/integration/template";
import type { EffectOutcome, RunEffect } from "./sync";
import { pairingCode, PairingRegistry } from "./sync-pairing";

const root = resolve(`./.tmp-sync-server-${randomUUID()}`);
const pcFile = join(root, "pc", "quoin.sqlite");
const phoneFile = join(root, "phone", "quoin.sqlite");
const INSTRUMENT = "IE00TEST0001";

let server: import("./sync-server.server").RunningSyncServer;
let phoneStore: SqliteSyncStore;
let sync: typeof import("./sync");
let phoneId: string;
let deviceToken: string;

const pairing = new PairingRegistry();
let runEffect: RunEffect = async (effect) => ({ effect, ok: true });

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  json: Record<string, unknown>;
  fingerprint: string;
}

function call(
  method: string,
  path: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<Reply> {
  const gzipped =
    options.body === undefined
      ? undefined
      : gzipSync(JSON.stringify(options.body));
  return new Promise((done, reject) => {
    const req = httpsRequest(
      {
        port: server.port,
        method,
        path,
        rejectUnauthorized: false,
        headers: {
          "Accept-Encoding": "gzip",
          ...(gzipped ? { "Content-Encoding": "gzip" } : {}),
          ...options.headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        const peer = (res.socket as TLSSocket).getPeerCertificate();
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          done({
            status: res.statusCode ?? 0,
            headers: res.headers,
            json: JSON.parse(
              gunzipSync(Buffer.concat(chunks)).toString(),
            ) as Record<string, unknown>,
            fingerprint: peer.fingerprint256.replaceAll(":", "").toLowerCase(),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end(gzipped);
  });
}

const authed = () => ({
  Authorization: `Bearer ${deviceToken}`,
  "X-Quoin-Device": phoneId,
});

const pcRow = (sql: string, ...params: unknown[]) => {
  const db = new Database(pcFile, { readonly: true });
  try {
    return db.prepare(sql).get(...params) as
      | Record<string, unknown>
      | undefined;
  } finally {
    db.close();
  }
};

function phoneHoldsInstrument(): void {
  const db = new Database(phoneFile);
  try {
    db.prepare(
      `INSERT INTO "Instrument" ("id", "name", "type", "quoteSymbol", "quoteSymbolHlc")
       VALUES (?, 'Test Fund', 'ETF', 'TEST.DE', ?)`,
    ).run(
      INSTRUMENT,
      `${String(Date.now() - 1000).padStart(15, "0")}-0000-${phoneId}`,
    );
  } finally {
    db.close();
  }
}

beforeAll(async () => {
  mkdirSync(join(root, "pc"), { recursive: true });
  mkdirSync(join(root, "phone"), { recursive: true });
  migratedDatabase(pcFile);
  migratedDatabase(phoneFile);
  process.env.DATABASE_URL = `file:${pcFile}`;

  const persistence = await import("~/adapters/persistence");
  sync = await import("./sync");
  const { AuthThrottle } = await import("./sync-api");
  const { startSyncServer } = await import("./sync-server.server");

  phoneStore = new persistence.SqliteSyncStore(phoneFile);
  phoneId = await phoneStore.transaction(
    (tx) => tx.read().device.state.deviceId,
  );
  server = await startSyncServer({
    databaseFile: pcFile,
    dataDirectory: join(root, "pc"),
    port: 0,
    pairing,
    throttle: new AuthThrottle(),
    runEffect: (effect) => runEffect(effect),
    now: () => new Date(),
  });
});

afterAll(async () => {
  await server?.close();
  phoneStore?.close();
  const { prisma } = await import("~/adapters/persistence");
  await prisma.$disconnect();
  rmSync(root, { recursive: true, force: true });
});

describe("the sync server over HTTPS, between two databases", () => {
  it("says hello to anyone, with the certificate the QR would pin", async () => {
    const hello = await call("GET", "/v1/hello");

    expect(hello.status).toBe(200);
    expect(hello.json).toMatchObject({ versions: [1] });
    expect(hello.fingerprint).toBe(server.sha256);
  });

  it("refuses the data to a client with no token", async () => {
    const reply = await call("GET", "/v1/sync");
    expect(reply.status).toBe(401);
    expect(reply.json).toEqual({ error: "unauthorized" });
  });

  it("pairs when the computer confirms, showing the same code on both", async () => {
    const { token } = pairing.start(Date.now());
    const asked = call("POST", "/v1/pair", {
      body: { token, deviceId: phoneId, name: "Test phone" },
    });
    await expect.poll(() => pairing.state().status).toBe("confirming");
    expect(pairing.state()).toMatchObject({
      name: "Test phone",
      code: pairingCode(token, phoneId),
    });

    pairing.confirm();
    const reply = await asked;

    expect(reply.status).toBe(200);
    deviceToken = String(reply.json.token);
    const stored = pcRow(
      `SELECT "tokenHash" FROM "PairedDevice" WHERE "deviceId" = ?`,
      phoneId,
    );
    expect(stored?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.tokenHash).not.toBe(deviceToken);
  });

  it("will not pair twice on one token", async () => {
    const reply = await call("POST", "/v1/pair", {
      body: { token: "used", deviceId: "other", name: "Other" },
    });
    expect(reply.status).toBe(401);
  });

  it("brings the phone what the computer has", async () => {
    const reply = await call("GET", "/v1/sync", { headers: authed() });

    expect(reply.status).toBe(200);
    expect(reply.headers.etag).toMatch(/^"[0-9a-f]{64}"$/);
    const imported = await sync.importState(
      {
        store: phoneStore,
        runEffect: async (effect) => ({ effect, ok: true }),
        now: new Date(),
      },
      reply.json,
      { dryRun: false },
    );
    expect(["applied", "up-to-date"]).toContain(imported.status);
  });

  it("refuses an exchange made on a state that has moved", async () => {
    const exchange = await sync.exportState(phoneStore, new Date());
    const reply = await call("POST", "/v1/sync", {
      body: exchange,
      headers: { ...authed(), "If-Match": '"stale"' },
    });
    expect(reply.status).toBe(409);
    expect(reply.json).toEqual({ error: "state-changed" });
  });

  it("applies the phone's change, backs up once, and answers before the download ends", async () => {
    phoneHoldsInstrument();
    let finish: (outcome: EffectOutcome) => void = () => {};
    const started: Effect[] = [];
    runEffect = (effect) => {
      started.push(effect);
      return new Promise((done) => {
        finish = done;
      });
    };

    const current = await call("GET", "/v1/sync", { headers: authed() });
    const posted = await call("POST", "/v1/sync", {
      body: await sync.exportState(phoneStore, new Date()),
      headers: { ...authed(), "If-Match": String(current.headers.etag) },
    });

    expect(posted.status).toBe(200);
    expect(posted.json).toMatchObject({
      status: "applied",
      counts: { newInstruments: 1 },
    });
    expect(
      pcRow(
        `SELECT "quoteSymbol" FROM "Instrument" WHERE "id" = ?`,
        INSTRUMENT,
      ),
    ).toEqual({ quoteSymbol: "TEST.DE" });

    const backups = readdirSync(join(root, "pc", "backups", "sync"));
    expect(backups).toEqual([
      `quoin-sync-${today("Europe/Madrid", new Date())}.sqlite`,
    ]);
    const copy = new Database(
      join(root, "pc", "backups", "sync", backups[0]!),
      {
        readonly: true,
      },
    );
    expect(
      copy
        .prepare(`SELECT count(*) AS n FROM "Instrument" WHERE "id" = ?`)
        .get(INSTRUMENT),
    ).toEqual({ n: 0 });
    copy.close();

    expect(server.effects.pending().has(INSTRUMENT)).toBe(true);
    const asked = {
      instruments: [
        { instrumentId: INSTRUMENT, seriesVersion: null, last: null },
      ],
    };
    const during = await call("POST", "/v1/prices", {
      body: asked,
      headers: authed(),
    });
    expect(during.json.instruments).toMatchObject([{ kind: "pending" }]);

    await expect.poll(() => started.length).toBe(1);
    finish({ effect: started[0]!, ok: false, reason: "no-candles" });
    await server.effects.idle();

    const after = await call("POST", "/v1/prices", {
      body: asked,
      headers: authed(),
    });
    expect(after.json.instruments).toMatchObject([{ kind: "full", rows: [] }]);
    const device = pcRow(
      `SELECT "lastCounts", "lastAddress" FROM "PairedDevice" WHERE "deviceId" = ?`,
      phoneId,
    );
    expect(JSON.parse(String(device?.lastCounts))).toMatchObject({
      newInstruments: 1,
      failedPrices: 1,
      failedRates: 0,
    });
    expect(device?.lastAddress).toBeTruthy();
  });

  it("converges: the next exchange brings no data and takes no second backup", async () => {
    const current = await call("GET", "/v1/sync", { headers: authed() });
    const imported = await sync.importState(
      {
        store: phoneStore,
        runEffect: async (effect) => ({ effect, ok: true }),
        now: new Date(),
      },
      current.json,
      { dryRun: false },
    );
    expect(["applied", "up-to-date"]).toContain(imported.status);

    const again = await call("GET", "/v1/sync", { headers: authed() });
    const posted = await call("POST", "/v1/sync", {
      body: await sync.exportState(phoneStore, new Date()),
      headers: { ...authed(), "If-Match": String(again.headers.etag) },
    });

    expect(posted.json).toMatchObject({ status: "up-to-date" });
    expect(readdirSync(join(root, "pc", "backups", "sync"))).toHaveLength(1);
  });

  it("refuses a revoked device", async () => {
    const { PrismaPairedDeviceRepository } =
      await import("~/adapters/persistence");
    await new PrismaPairedDeviceRepository().revoke(phoneId, new Date());

    const reply = await call("GET", "/v1/sync", { headers: authed() });

    expect(reply.status).toBe(403);
    expect(reply.json).toEqual({ error: "revoked" });
  });

  it("keeps its identity beside the database", () => {
    expect(existsSync(join(root, "pc", "sync", "key.pem"))).toBe(true);
    expect(existsSync(join(root, "pc", "sync", "cert.pem"))).toBe(true);
  });
});
