import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PairedDevice } from "~/adapters/persistence/paired-device-repository";
import { SyncBusyError } from "~/adapters/persistence/sync-repository";
import {
  applyPlan,
  formatHlc,
  syncStateSchema,
  type LocalDevice,
  type StoredPrices,
} from "~/core/sync";

import type { SyncStore } from "./sync";
import {
  AuthThrottle,
  handleSyncRequest,
  hashToken,
  stateEtag,
  type SyncApiDeps,
  type SyncRequest,
} from "./sync-api";
import { PairingRegistry } from "./sync-pairing";

const T = Date.UTC(2026, 10, 6, 10);
const PHONE = "dev-phone";
const TOKEN = "device-token";
const mark = (deviceId: string, ms: number) =>
  formatHlc({ ms, counter: 0, deviceId });
const SETTINGS = { residence: "bizkaia", residenceHlc: null };

function fixture() {
  const named: { name: string | null } = { name: "PC" };
  let device: LocalDevice = {
    state: syncStateSchema.parse({ deviceId: "dev-pc", settings: SETTINGS }),
    lastHlc: mark("dev-pc", T - 1),
  };
  const run = vi.fn();
  const store: SyncStore = {
    transaction: async (fn) => {
      let working = device;
      const value = fn({
        read: () => ({ device: working, name: named.name }),
        all: () => [],
        setLastHlc: (lastHlc) => {
          working = { ...working, lastHlc };
        },
        apply: (plan, _sender, nowMs) => {
          working = applyPlan(working, plan, nowMs);
        },
        savePeers: (peers) => {
          working = {
            ...working,
            state: { ...working.state, peers: [...peers] },
          };
        },
        run,
      });
      device = working;
      return value;
    },
  };
  const paired: PairedDevice = {
    deviceId: PHONE,
    name: "Phone",
    tokenHash: hashToken(TOKEN),
    pairedAt: new Date(T),
    lastSyncAt: null,
    lastAddress: null,
    lastCounts: null,
    revokedAt: null,
  };
  const devices = new Map([[PHONE, paired]]);
  const stored = new Map<string, StoredPrices>();
  const pending = new Set<string>();
  const enqueue = vi.fn();
  const beforeApply = vi.fn();
  const recordSync = vi.fn();
  const saveDevice = vi.fn();
  const pairing = new PairingRegistry();
  const deps: SyncApiDeps = {
    serverName: () => "PC",
    store,
    devices: { find: (id) => devices.get(id) ?? null },
    saveDevice,
    recordSync,
    prices: {
      read: (_tx, ids) =>
        new Map(
          ids.flatMap((id) => {
            const hit = stored.get(id);
            return hit ? [[id, hit] as const] : [];
          }),
        ),
    },
    pairing,
    throttle: new AuthThrottle(),
    beforeApply,
    effects: { enqueue, pending: () => pending },
    now: () => new Date(T),
  };
  return {
    deps,
    named,
    devices,
    paired,
    stored,
    pending,
    enqueue,
    beforeApply,
    recordSync,
    saveDevice,
    pairing,
    store,
  };
}

const authed = (extra: Partial<SyncRequest>): SyncRequest => ({
  method: "GET",
  path: "/v1/sync",
  authorization: `Bearer ${TOKEN}`,
  deviceId: PHONE,
  address: "192.168.1.30",
  ...extra,
});
const fund = { id: "IE00TEST0001", name: "Test Fund", type: "ETF" };
const exchange = (extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  deviceId: PHONE,
  deviceName: "Phone",
  exportHlc: mark(PHONE, T),
  settings: SETTINGS,
  ...extra,
});
const bringsSymbol = exchange({
  instruments: [
    { ...fund, quoteSymbol: "TEST.DE", quoteSymbolHlc: mark(PHONE, T - 1) },
  ],
});

let f: ReturnType<typeof fixture>;
beforeEach(() => {
  f = fixture();
});

async function etag(): Promise<string> {
  const { headers } = await handleSyncRequest(f.deps, authed({}));
  return headers?.ETag ?? "";
}

describe("GET /v1/hello", () => {
  it("names the versions and the computer, with no token", async () => {
    await expect(
      handleSyncRequest(f.deps, {
        method: "GET",
        path: "/v1/hello",
        address: "x",
      }),
    ).resolves.toEqual({ status: 200, body: { versions: [1], name: "PC" } });
  });
});

describe("authentication", () => {
  it.each<[string, Partial<SyncRequest>]>([
    ["no token", { authorization: undefined }],
    ["a wrong token", { authorization: "Bearer other" }],
    ["another scheme", { authorization: `Basic ${TOKEN}` }],
    ["no device", { deviceId: undefined }],
    ["an unknown device", { deviceId: "dev-other" }],
  ])("answers 401 to %s", async (_label, extra) => {
    await expect(handleSyncRequest(f.deps, authed(extra))).resolves.toEqual({
      status: 401,
      body: { error: "unauthorized" },
    });
  });

  it("answers 403 to a revoked device holding the right token", async () => {
    f.devices.set(PHONE, { ...f.paired, revokedAt: new Date(T) });
    await expect(handleSyncRequest(f.deps, authed({}))).resolves.toEqual({
      status: 403,
      body: { error: "revoked" },
    });
  });

  it("does not tell a revoked device from an unknown one without the token", async () => {
    f.devices.set(PHONE, { ...f.paired, revokedAt: new Date(T) });
    const answer = await handleSyncRequest(
      f.deps,
      authed({ authorization: "Bearer other" }),
    );
    expect(answer.status).toBe(401);
  });

  it("backs off globally after repeated failures, then recovers", async () => {
    const wrong = authed({ authorization: "Bearer other" });
    for (let i = 0; i < 6; i++) {
      expect((await handleSyncRequest(f.deps, wrong)).status).toBe(401);
    }

    const blocked = await handleSyncRequest(f.deps, authed({}));
    expect(blocked.status).toBe(429);
    expect(blocked.headers?.["Retry-After"]).toBe("1");

    f.deps.now = () => new Date(T + 1000);
    expect((await handleSyncRequest(f.deps, authed({}))).status).toBe(200);
    expect(f.deps.throttle.retryAfterMs(T + 1000)).toBe(0);
  });
});

describe("GET /v1/sync", () => {
  it("answers the state with an ETag that ignores the export mark", async () => {
    const first = await handleSyncRequest(f.deps, authed({}));
    const second = await handleSyncRequest(f.deps, authed({}));

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ deviceId: "dev-pc", schemaVersion: 1 });
    expect(first.headers?.ETag).toMatch(/^"[0-9a-f]{64}"$/);
    expect(second.headers?.ETag).toBe(first.headers?.ETag);
    expect(stateEtag(second.body as never)).toBe(first.headers?.ETag);
  });

  it("with no name stored, carries the one hello gives, and POST agrees on the ETag", async () => {
    f.named.name = null;
    f.deps.serverName = () => "host-pc";

    const got = await handleSyncRequest(f.deps, authed({}));
    expect(got.body).toMatchObject({ deviceName: "host-pc" });

    const posted = await handleSyncRequest(
      f.deps,
      authed({
        method: "POST",
        body: { ...exchange(), deviceId: PHONE },
        ifMatch: got.headers?.ETag,
      }),
    );
    expect(posted.status).toBe(200);
  });

  it("answers 503 with a retry when the database is busy", async () => {
    f.deps.store = {
      transaction: async () => {
        throw new SyncBusyError(new Error("locked"));
      },
    };
    await expect(handleSyncRequest(f.deps, authed({}))).resolves.toEqual({
      status: 503,
      body: { error: "busy" },
      headers: { "Retry-After": "1" },
    });
  });
});

describe("POST /v1/sync", () => {
  const post = (body: unknown, ifMatch?: string) =>
    authed({ method: "POST", body, ifMatch });

  it("applies, answers after the commit and leaves the effects queued", async () => {
    const answer = await handleSyncRequest(
      f.deps,
      post(bringsSymbol, await etag()),
    );

    expect(answer).toMatchObject({
      status: 200,
      body: { status: "applied", counts: { newInstruments: 1 }, setAside: [] },
    });
    expect(f.beforeApply).toHaveBeenCalledOnce();
    expect(f.enqueue).toHaveBeenCalledWith(PHONE, [
      expect.objectContaining({ kind: "prices", symbol: "TEST.DE" }),
    ]);
    expect(f.recordSync).toHaveBeenCalledWith(
      expect.anything(),
      PHONE,
      expect.objectContaining({
        at: new Date(T),
        address: "192.168.1.30",
        counts: expect.stringContaining('"newInstruments":1'),
      }),
    );
  });

  it("refuses with 409 when the state moved since the GET", async () => {
    const before = await etag();
    await handleSyncRequest(f.deps, post(bringsSymbol, before));

    const again = await handleSyncRequest(
      f.deps,
      post(exchange({ exportHlc: mark(PHONE, T + 1) }), before),
    );

    expect(again).toEqual({ status: 409, body: { error: "state-changed" } });
  });

  it("refuses with 409 when no If-Match arrives", async () => {
    const answer = await handleSyncRequest(f.deps, post(bringsSymbol));
    expect(answer.status).toBe(409);
    expect(f.beforeApply).not.toHaveBeenCalled();
  });

  it("refuses a file from another device", async () => {
    const answer = await handleSyncRequest(
      f.deps,
      post(exchange({ deviceId: "dev-other" }), await etag()),
    );
    expect(answer).toEqual({ status: 403, body: { error: "device-mismatch" } });
  });

  it("answers a real conflict with 200 and applies nothing", async () => {
    await f.store.transaction((tx) =>
      tx.savePeers([], { deviceId: "x", name: null }, T),
    );
    const local = await f.store.transaction((tx) => tx.read().device);
    f.deps.store = {
      transaction: async (fn) =>
        fn({
          read: () => ({
            device: {
              ...local,
              state: {
                ...local.state,
                settings: {
                  residence: "bizkaia",
                  residenceHlc: mark("dev-pc", T - 1),
                },
              },
            },
            name: "PC",
          }),
          setLastHlc: () => {},
          apply: () => {
            throw new Error("nothing should apply");
          },
          savePeers: () => {},
          run: () => {},
          all: () => [],
        }),
    };

    const answer = await handleSyncRequest(
      f.deps,
      post(
        exchange({
          settings: { residence: "araba", residenceHlc: mark(PHONE, T) },
        }),
        await etag(),
      ),
    );

    expect(answer).toMatchObject({
      status: 200,
      body: { status: "conflicts" },
    });
    expect(f.enqueue).not.toHaveBeenCalled();
    expect(f.recordSync).not.toHaveBeenCalled();
  });

  it("records an exchange that brought nothing, without a backup", async () => {
    const answer = await handleSyncRequest(
      f.deps,
      post(exchange(), await etag()),
    );

    expect(answer).toMatchObject({ body: { status: "up-to-date" } });
    expect(f.beforeApply).not.toHaveBeenCalled();
    expect(f.recordSync).toHaveBeenCalledOnce();
  });

  it.each([
    [2, "server"],
    [0, "client"],
  ])("names the side to update for version %s", async (found, update) => {
    const answer = await handleSyncRequest(
      f.deps,
      post(exchange({ schemaVersion: found }), await etag()),
    );
    expect(answer).toEqual({
      status: 400,
      body: {
        error: "unsupported-schema-version",
        found,
        supported: [1],
        update,
      },
    });
  });

  it("answers 400 to a malformed exchange", async () => {
    const answer = await handleSyncRequest(
      f.deps,
      post(exchange({ ledger: "nope" }), await etag()),
    );
    expect(answer).toEqual({
      status: 400,
      body: { error: "invalid-exchange" },
    });
  });

  it("does not swallow what it does not understand", async () => {
    f.deps.store = {
      transaction: async () => {
        throw new Error("boom");
      },
    };
    await expect(handleSyncRequest(f.deps, authed({}))).rejects.toThrow("boom");
  });
});

describe("POST /v1/prices", () => {
  const holding = {
    instrumentId: "A",
    seriesVersion: null,
    last: null,
  };
  const post = (instruments: unknown) =>
    authed({ method: "POST", path: "/v1/prices", body: { instruments } });
  const row = {
    asOf: "2026-10-13T07:00:00.000Z",
    price: "10",
    currency: "EUR",
    source: "YAHOO",
  };

  it("answers each instrument on its own", async () => {
    f.stored.set("A", { seriesVersion: "v1", rows: [row] });
    f.pending.add("B");

    const answer = await handleSyncRequest(
      f.deps,
      post([
        holding,
        { ...holding, instrumentId: "B" },
        { ...holding, instrumentId: "C" },
      ]),
    );

    expect(answer).toEqual({
      status: 200,
      body: {
        instruments: [
          { instrumentId: "A", kind: "full", seriesVersion: "v1", rows: [row] },
          { instrumentId: "B", kind: "pending" },
          {
            instrumentId: "C",
            kind: "full",
            seriesVersion: expect.any(String),
            rows: [],
          },
        ],
      },
    });
  });

  it("answers 400 to a malformed request", async () => {
    const answer = await handleSyncRequest(f.deps, post("nope"));
    expect(answer).toEqual({ status: 400, body: { error: "invalid-request" } });
  });

  it("needs a token", async () => {
    const answer = await handleSyncRequest(f.deps, {
      ...post([]),
      authorization: undefined,
    });
    expect(answer.status).toBe(401);
  });
});

describe("POST /v1/pair", () => {
  const request = (token: string): SyncRequest => ({
    method: "POST",
    path: "/v1/pair",
    body: { token, deviceId: PHONE, name: "New phone" },
    address: "x",
  });

  it("stays open until confirmed, then hands over a token stored only as a hash", async () => {
    const { token } = f.pairing.start(T);
    const pending = handleSyncRequest(f.deps, request(token));
    expect(f.saveDevice).not.toHaveBeenCalled();

    f.pairing.confirm();
    const answer = await pending;

    expect(answer.status).toBe(200);
    const issued = (answer.body as { token: string }).token;
    expect(issued).toMatch(/^[\w-]{43}$/);
    expect(f.saveDevice).toHaveBeenCalledWith(
      expect.anything(),
      { deviceId: PHONE, name: "New phone", tokenHash: hashToken(issued) },
      new Date(T),
    );
  });

  it("answers a rejection, and stores nothing", async () => {
    const pending = handleSyncRequest(
      f.deps,
      request(f.pairing.start(T).token),
    );
    f.pairing.reject();

    await expect(pending).resolves.toEqual({
      status: 403,
      body: { error: "rejected" },
    });
    expect(f.saveDevice).not.toHaveBeenCalled();
  });

  it("answers a cancelled pairing as expired", async () => {
    const pending = handleSyncRequest(
      f.deps,
      request(f.pairing.start(T).token),
    );
    f.pairing.cancel();

    await expect(pending).resolves.toEqual({
      status: 410,
      body: { error: "expired" },
    });
  });

  it("answers 401 to a wrong token and counts the failure", async () => {
    f.pairing.start(T);
    await expect(handleSyncRequest(f.deps, request("wrong"))).resolves.toEqual({
      status: 401,
      body: { error: "invalid-token" },
    });
    for (let i = 0; i < 5; i++)
      await handleSyncRequest(f.deps, request("wrong"));
    expect((await handleSyncRequest(f.deps, request("wrong"))).status).toBe(
      429,
    );
  });

  it("marks the pairing as failed when the device cannot be stored", async () => {
    f.saveDevice.mockImplementation(() => {
      throw new SyncBusyError(new Error("locked"));
    });
    const pending = handleSyncRequest(
      f.deps,
      request(f.pairing.start(T).token),
    );
    f.pairing.confirm();

    await expect(pending).resolves.toMatchObject({ status: 503 });
    expect(f.pairing.state()).toEqual({ status: "expired" });
  });

  it("answers 400 to a request with no name", async () => {
    const answer = await handleSyncRequest(f.deps, {
      ...request("x"),
      body: { token: "x", deviceId: PHONE },
    });
    expect(answer).toEqual({ status: 400, body: { error: "invalid-request" } });
  });
});

describe("an unknown route", () => {
  it("answers 404 without asking for a token", async () => {
    await expect(
      handleSyncRequest(f.deps, {
        method: "GET",
        path: "/v1/nope",
        address: "x",
      }),
    ).resolves.toEqual({ status: 404, body: { error: "not-found" } });
  });
});
