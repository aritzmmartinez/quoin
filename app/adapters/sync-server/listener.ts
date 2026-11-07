import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";

const gunzipAsync = promisify(gunzip);
const gzipAsync = promisify(gzip);

export const MAX_BODY_BYTES = 4 * 1024 * 1024;
export const MAX_DECOMPRESSED_BYTES = 16 * 1024 * 1024;

export interface SyncRequest {
  method: string;
  path: string;
  authorization?: string | undefined;
  deviceId?: string | undefined;
  ifMatch?: string | undefined;
  body?: unknown;
  address: string;
  signal?: AbortSignal;
}

export interface SyncResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export interface ListenerOptions {
  key: string;
  cert: string;
  port: number;
  handle: (request: SyncRequest) => Promise<SyncResponse>;
  onError: (error: unknown) => void;
  maxBodyBytes?: number;
  maxDecompressedBytes?: number;
}

export interface Listener {
  port: number;
  close(): Promise<void>;
}

class BadBody extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

const tooLarge = () => new BadBody(413, "too-large");
const invalid = () => new BadBody(400, "invalid-request");

function readBytes(req: IncomingMessage, max: number): Promise<Buffer> {
  if (Number(req.headers["content-length"]) > max) {
    return Promise.reject(tooLarge());
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const onData = (chunk: Buffer) => {
      total += chunk.length;
      if (total > max) {
        req.off("data", onData);
        reject(tooLarge());
        return;
      }
      chunks.push(chunk);
    };
    req.on("data", onData);
    req.once("end", () => resolve(Buffer.concat(chunks)));
    req.once("error", () => reject(invalid()));
    req.once("close", () => reject(invalid()));
  });
}

async function decompress(
  bytes: Buffer,
  encoding: string | undefined,
  maxOutputLength: number,
): Promise<Buffer> {
  if (encoding === undefined || encoding === "identity") return bytes;
  if (encoding !== "gzip") throw new BadBody(415, "unsupported-encoding");
  try {
    return await gunzipAsync(bytes, { maxOutputLength });
  } catch (error) {
    throw (error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE"
      ? tooLarge()
      : invalid();
  }
}

async function readJson(
  req: IncomingMessage,
  options: ListenerOptions,
): Promise<unknown> {
  const bytes = await readBytes(req, options.maxBodyBytes ?? MAX_BODY_BYTES);
  if (bytes.length === 0) return undefined;
  const text = await decompress(
    bytes,
    req.headers["content-encoding"],
    options.maxDecompressedBytes ?? MAX_DECOMPRESSED_BYTES,
  );
  try {
    return JSON.parse(text.toString("utf8"));
  } catch {
    throw invalid();
  }
}

async function answer(
  req: IncomingMessage,
  options: ListenerOptions,
  signal: AbortSignal,
): Promise<SyncResponse> {
  try {
    return await options.handle({
      method: req.method ?? "",
      path: (req.url ?? "").split("?", 1)[0] ?? "",
      authorization: req.headers.authorization,
      deviceId: req.headers["x-quoin-device"]?.toString(),
      ifMatch: req.headers["if-match"],
      body: req.method === "POST" ? await readJson(req, options) : undefined,
      address: (req.socket.remoteAddress ?? "").replace(/^::ffff:/, ""),
      signal,
    });
  } catch (error) {
    if (error instanceof BadBody) {
      return {
        status: error.status,
        body: { error: error.code },
        headers: { Connection: "close" },
      };
    }
    options.onError(error);
    return { status: 500, body: { error: "internal" } };
  }
}

async function respond(
  req: IncomingMessage,
  res: ServerResponse,
  options: ListenerOptions,
): Promise<void> {
  const hangUp = new AbortController();
  res.once("close", () => {
    if (!res.writableEnded) hangUp.abort();
  });
  const { status, body, headers } = await answer(req, options, hangUp.signal);
  const json = Buffer.from(JSON.stringify(body));
  const compress = /\bgzip\b/.test(req.headers["accept-encoding"] ?? "");
  const payload = compress ? await gzipAsync(json) : json;
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": payload.length,
    ...(compress ? { "Content-Encoding": "gzip" } : {}),
    ...headers,
  });
  res.end(payload);
}

export function listen(options: ListenerOptions): Promise<Listener> {
  const server = createServer(
    { key: options.key, cert: options.cert },
    (req, res) => {
      respond(req, res, options).catch((error: unknown) => {
        options.onError(error);
        res.destroy();
      });
    },
  );

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, () => {
      server.off("error", reject);
      server.on("error", options.onError);
      resolve({
        port: (server.address() as AddressInfo).port,
        close: () =>
          new Promise((closed) => {
            server.close(() => closed());
            server.closeAllConnections();
          }),
      });
    });
  });
}
