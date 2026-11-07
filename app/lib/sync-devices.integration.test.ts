import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { createServer } from "node:net";
import { hostname } from "node:os";
import { join, resolve } from "node:path";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { migratedDatabase } from "../../test/integration/template";
import type { DevicesResponse } from "./sync-devices";

const qr = vi.hoisted(() => ({ text: "" }));
vi.mock("uqr", () => ({
  renderSVG: (text: string) => {
    qr.text = text;
    return "<svg/>";
  },
}));

const root = resolve(`./.tmp-sync-devices-${randomUUID()}`);
const file = join(root, "quoin.sqlite");

let devices: typeof import("./sync-devices.server");
let server: typeof import("./sync-server.server");

const form = (fields: Record<string, string>) => {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return body;
};

function post(
  fields: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<DevicesResponse> {
  return devices.devicesAction(
    new Request("http://localhost:3000/api/devices", {
      method: "POST",
      body: form(fields),
      headers,
    }),
  );
}

const view = () =>
  devices.loadDevices(new Request("http://localhost:3000/settings"));

function freePort(): Promise<number> {
  return new Promise((done, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => done(port));
    });
  });
}

function phone(
  port: number,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  return new Promise((done, reject) => {
    const req = httpsRequest(
      { port, method, path, rejectUnauthorized: false },
      (res) => {
        let text = "";
        res.on("data", (chunk: Buffer) => (text += chunk.toString()));
        res.on("end", () =>
          done({
            status: res.statusCode ?? 0,
            json: JSON.parse(text) as Record<string, unknown>,
          }),
        );
      },
    );
    req.on("error", reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

beforeAll(async () => {
  mkdirSync(root, { recursive: true });
  migratedDatabase(file);
  process.env.DATABASE_URL = `file:${file}`;
  devices = await import("./sync-devices.server");
  server = await import("./sync-server.server");
});

afterAll(async () => {
  const running = await server.ensureListener().catch(() => null);
  await running?.close();
  const { prisma } = await import("~/adapters/persistence");
  await prisma.$disconnect();
  rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("Devices, from the settings screen to the phone", () => {
  it("refuses what another site posts and an intent it does not know", async () => {
    await expect(
      post({ intent: "pair-start" }, { "Sec-Fetch-Site": "cross-site" }),
    ).resolves.toEqual({ ok: false, error: "refused" });
    await expect(post({ intent: "nope" })).resolves.toEqual({
      ok: false,
      error: "refused",
    });
  });

  it("refuses an invalid address and keeps what was stored", async () => {
    await expect(
      post({ intent: "save-host", host: "not a host" }),
    ).resolves.toEqual({ ok: false, error: "invalid-host" });
    await expect(
      post({ intent: "save-port", port: "70000" }),
    ).resolves.toEqual({ ok: false, error: "invalid-port" });
    expect(await view()).toMatchObject({ host: null, port: 3443 });
  });

  it("in Docker with a browser on localhost asks for the address before pairing", async () => {
    vi.stubEnv("QUOIN_RUNTIME", "docker");
    await expect(post({ intent: "pair-start" })).resolves.toEqual({
      ok: false,
      error: "need-address",
    });
    expect(await view()).toMatchObject({
      proposals: [],
      defaultName: "Quoin",
    });
  });

  it("says so when the port is taken, and starts no pairing", async () => {
    const taken = createServer();
    const port = await freePort();
    await new Promise<void>((done) => taken.listen(port, done));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await post({ intent: "save-host", host: "192.168.1.20" });
      await post({ intent: "save-port", port: String(port) });
      await expect(post({ intent: "pair-start" })).resolves.toEqual({
        ok: false,
        error: "port-unavailable",
        port,
      });
      expect(devices.pairingState().status).not.toBe("waiting");
    } finally {
      logged.mockRestore();
      await new Promise((done) => taken.close(done));
    }
  });

  it("pairs: the QR carries the name, the pin and the published port", async () => {
    const port = await freePort();
    await post({ intent: "save-port", port: String(port) });
    await post({ intent: "save-name", name: "  Salón  " });

    const started = await post({ intent: "pair-start" });
    expect(started).toMatchObject({
      ok: true,
      state: { status: "waiting" },
      pairing: { svg: "<svg/>", expiresInMs: 120_000 },
    });

    const running = await server.ensureListener();
    const payload = JSON.parse(qr.text) as Record<string, unknown>;
    expect(payload).toEqual({
      v: 1,
      host: "192.168.1.20",
      port,
      sha256: running.sha256,
      token: expect.any(String),
      name: "Salón",
    });
    expect(running.port).toBe(port);

    const asked = phone(port, "POST", "/v1/pair", {
      token: payload.token,
      deviceId: "dev-phone",
      name: "Test phone",
    });
    await expect.poll(() => devices.pairingState().status).toBe("confirming");

    await expect(post({ intent: "pair-confirm" })).resolves.toMatchObject({
      state: { status: "paired", name: "Test phone" },
    });
    await expect(asked).resolves.toMatchObject({
      status: 200,
      json: { token: expect.any(String) },
    });
  });

  it("shows the device without its token's hash, on the page and in the poll", async () => {
    const { devices: listed } = await view();
    const polled = await devices.pollDevices();

    expect(listed).toMatchObject([{ deviceId: "dev-phone", name: "Test phone" }]);
    expect(polled.devices).toEqual(listed);
    expect(JSON.stringify(polled)).not.toContain("tokenHash");
  });

  it("tells the phone the new name everywhere, leaving every mark alone", async () => {
    const marks = () => {
      const db = new Database(file, { readonly: true });
      try {
        return db.prepare(`SELECT "lastHlc" FROM "SyncDevice"`).get();
      } finally {
        db.close();
      }
    };
    const before = marks();

    await post({ intent: "save-name", name: "Despacho" });

    const { port } = await server.ensureListener();
    const hello = await phone(port, "GET", "/v1/hello");
    expect(hello.json.name).toBe("Despacho");
    expect(marks()).toEqual(before);
  });

  it("an empty name goes back to the computer's own", async () => {
    await post({ intent: "save-name", name: "" });

    const { port } = await server.ensureListener();
    const hello = await phone(port, "GET", "/v1/hello");
    expect(hello.json.name).toBe(hostname());
    expect((await view()).name).toBeNull();
  });

  it("moves the listener when the port changes", async () => {
    const before = await server.ensureListener();
    const port = await freePort();

    await expect(
      post({ intent: "save-port", port: String(port) }),
    ).resolves.toEqual({ ok: true });

    const after = await server.ensureListener();
    expect(after.port).toBe(port);
    expect(after.sha256).toBe(before.sha256);
    expect(await view()).toMatchObject({ host: "192.168.1.20", port });
    await expect(phone(port, "GET", "/v1/hello")).resolves.toMatchObject({
      status: 200,
    });
  });

  it("rejects: the phone is told, and nothing is stored", async () => {
    await post({ intent: "pair-start" });
    const { port } = await server.ensureListener();
    const { token } = JSON.parse(qr.text) as { token: string };
    const asked = phone(port, "POST", "/v1/pair", {
      token,
      deviceId: "dev-other",
      name: "Other",
    });
    await expect.poll(() => devices.pairingState().status).toBe("confirming");

    await post({ intent: "pair-reject" });

    await expect(asked).resolves.toMatchObject({
      status: 403,
      json: { error: "rejected" },
    });
    expect((await view()).devices).toHaveLength(1);
  });

  it("expires when the phone hangs up, and a late confirmation stores nothing", async () => {
    await post({ intent: "pair-start" });
    const { port } = await server.ensureListener();
    const { token } = JSON.parse(qr.text) as { token: string };
    const req = httpsRequest({
      port,
      method: "POST",
      path: "/v1/pair",
      rejectUnauthorized: false,
    });
    req.on("error", () => {});
    req.end(JSON.stringify({ token, deviceId: "dev-gone", name: "Gone" }));
    await expect.poll(() => devices.pairingState().status).toBe("confirming");

    req.destroy();

    await expect.poll(() => devices.pairingState().status).toBe("expired");
    await expect(post({ intent: "pair-confirm" })).resolves.toMatchObject({
      state: { status: "expired" },
    });
    expect((await view()).devices).toHaveLength(1);
  });

  it("revokes from the list", async () => {
    await post({ intent: "revoke", deviceId: "dev-phone" });

    expect((await view()).devices[0]?.revokedAt).toEqual(expect.any(String));
  });
});
