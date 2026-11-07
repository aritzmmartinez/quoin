import { mkdtempSync, rmSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadTlsIdentity, type TlsIdentity } from "./identity";
import { listen, type Listener, type SyncRequest } from "./listener";

let directory: string;
let identity: TlsIdentity;
let listener: Listener;
let seen: SyncRequest[] = [];
let errors: unknown[] = [];
let fail: Error | null = null;

const MAX_BODY = 1024;
const MAX_DECOMPRESSED = 4096;

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  bytes: Buffer;
  json: () => unknown;
}

function send(
  options: {
    method?: string;
    path?: string;
    headers?: Record<string, string>;
    body?: Buffer | string;
    chunked?: boolean;
  } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        port: listener.port,
        method: options.method ?? "POST",
        path: options.path ?? "/v1/echo",
        headers: options.headers,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const bytes = Buffer.concat(chunks);
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            bytes,
            json: () => JSON.parse(bytes.toString()),
          });
        });
      },
    );
    req.on("error", reject);
    if (options.chunked) req.flushHeaders();
    req.end(options.body);
  });
}

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "quoin-listener-"));
  identity = await loadTlsIdentity(directory, new Date());
  listener = await listen({
    key: identity.key,
    cert: identity.cert,
    port: 0,
    maxBodyBytes: MAX_BODY,
    maxDecompressedBytes: MAX_DECOMPRESSED,
    onError: (error) => errors.push(error),
    handle: async (request) => {
      seen.push(request);
      if (fail) throw fail;
      return {
        status: 200,
        body: { ok: true },
        headers: { ETag: '"tag"' },
      };
    },
  });
});

afterAll(async () => {
  await listener.close();
  rmSync(directory, { recursive: true, force: true });
});

beforeEach(() => {
  seen = [];
  errors = [];
  fail = null;
});

describe("the sync listener", () => {
  it("hands over the request as the API reads it", async () => {
    const reply = await send({
      path: "/v1/sync?ignored=1",
      headers: {
        Authorization: "Bearer abc",
        "X-Quoin-Device": "dev-phone",
        "If-Match": '"etag"',
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ a: 1 }),
    });

    expect(reply.status).toBe(200);
    expect(reply.headers.etag).toBe('"tag"');
    expect(reply.json()).toEqual({ ok: true });
    expect(seen[0]).toMatchObject({
      method: "POST",
      path: "/v1/sync",
      authorization: "Bearer abc",
      deviceId: "dev-phone",
      ifMatch: '"etag"',
      body: { a: 1 },
    });
    expect(seen[0]?.address).not.toContain("::ffff:");
  });

  it("reads no body on a GET", async () => {
    await send({ method: "GET", path: "/v1/hello" });
    expect(seen[0]).toMatchObject({ method: "GET", body: undefined });
  });

  it("takes a gzipped body and answers in gzip when asked", async () => {
    const reply = await send({
      headers: { "Content-Encoding": "gzip", "Accept-Encoding": "gzip" },
      body: gzipSync(JSON.stringify({ a: 1 })),
    });

    expect(seen[0]?.body).toEqual({ a: 1 });
    expect(reply.headers["content-encoding"]).toBe("gzip");
    expect(JSON.parse(gunzipSync(reply.bytes).toString())).toEqual({
      ok: true,
    });
  });

  it("refuses a body over the limit by its declared length", async () => {
    const reply = await send({ body: Buffer.alloc(MAX_BODY + 1, 32) });

    expect(reply.status).toBe(413);
    expect(reply.json()).toEqual({ error: "too-large" });
    expect(seen).toEqual([]);
  });

  it("refuses a body over the limit that declares no length", async () => {
    const reply = await send({
      headers: { "Transfer-Encoding": "chunked" },
      body: Buffer.alloc(MAX_BODY + 1, 32),
      chunked: true,
    });

    expect(reply.status).toBe(413);
    expect(seen).toEqual([]);
  });

  it("refuses what decompresses past its limit, small as it arrives", async () => {
    const bomb = gzipSync(Buffer.alloc(MAX_DECOMPRESSED + 1, 32));
    expect(bomb.length).toBeLessThan(MAX_BODY);

    const reply = await send({
      headers: { "Content-Encoding": "gzip" },
      body: bomb,
    });

    expect(reply.status).toBe(413);
    expect(reply.json()).toEqual({ error: "too-large" });
    expect(seen).toEqual([]);
  });

  it.each([
    ["not JSON", {}, "{nope"],
    ["not gzip", { "Content-Encoding": "gzip" }, "plain"],
  ])("answers 400 to a body that is %s", async (_case, headers, body) => {
    const reply = await send({ headers, body });

    expect(reply.status).toBe(400);
    expect(reply.json()).toEqual({ error: "invalid-request" });
    expect(seen).toEqual([]);
  });

  it("refuses an encoding it does not read", async () => {
    const reply = await send({
      headers: { "Content-Encoding": "br" },
      body: "x",
    });
    expect(reply.status).toBe(415);
    expect(reply.json()).toEqual({ error: "unsupported-encoding" });
  });

  it("answers 500 with a code and no text, and reports the cause", async () => {
    fail = new Error("a secret detail");
    const reply = await send({ body: "{}" });

    expect(reply.status).toBe(500);
    expect(reply.json()).toEqual({ error: "internal" });
    expect(errors).toEqual([fail]);
  });

  it("closes while a request is still held open", async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const other = await listen({
      key: identity.key,
      cert: identity.cert,
      port: 0,
      onError: () => {},
      handle: async () => {
        await held;
        return { status: 200, body: {} };
      },
    });
    const pending = new Promise<string>((resolve) => {
      const req = httpsRequest(
        {
          port: other.port,
          method: "GET",
          path: "/v1/pair",
          rejectUnauthorized: false,
        },
        () => resolve("answered"),
      );
      req.on("error", () => resolve("cut"));
      req.on("socket", (socket) =>
        socket.once("secureConnect", () =>
          setTimeout(() => void other.close(), 50),
        ),
      );
      req.end();
    });

    await expect(pending).resolves.toBe("cut");
    release();
  });

  it("tells the handler when the client hangs up, and only then", async () => {
    let hungUp: (aborted: boolean) => void = () => {};
    const told = new Promise<boolean>((resolve) => {
      hungUp = resolve;
    });
    const signals: (AbortSignal | undefined)[] = [];
    const other = await listen({
      key: identity.key,
      cert: identity.cert,
      port: 0,
      onError: () => {},
      handle: async ({ path, signal }) => {
        signals.push(signal);
        if (path === "/v1/hello") return { status: 200, body: {} };
        await new Promise((resolve) =>
          signal?.addEventListener("abort", resolve, { once: true }),
        );
        hungUp(signal?.aborted ?? false);
        return { status: 410, body: {} };
      },
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const req = httpsRequest(
          {
            port: other.port,
            method: "GET",
            path: "/v1/hello",
            rejectUnauthorized: false,
          },
          (res) => res.resume().on("end", resolve),
        );
        req.on("error", reject);
        req.end();
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(signals[0]?.aborted).toBe(false);

      const req = httpsRequest({
        port: other.port,
        method: "POST",
        path: "/v1/pair",
        rejectUnauthorized: false,
      });
      req.on("error", () => {});
      req.end("{}", () => setTimeout(() => req.destroy(), 50));

      await expect(told).resolves.toBe(true);
    } finally {
      await other.close();
    }
  });

  it("fails to start on a port already taken, instead of hanging", async () => {
    await expect(
      listen({
        key: identity.key,
        cert: identity.cert,
        port: listener.port,
        onError: () => {},
        handle: async () => ({ status: 200, body: {} }),
      }),
    ).rejects.toMatchObject({ code: "EADDRINUSE" });
  });
});
