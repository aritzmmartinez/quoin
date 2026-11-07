import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import { ZodError, z } from "zod";

import type { PairedDevice } from "~/adapters/persistence/paired-device-repository";
import {
  SyncBusyError,
  type SyncTx,
} from "~/adapters/persistence/sync-repository";
import type {
  SyncRequest,
  SyncResponse,
} from "~/adapters/sync-server/listener";
import {
  answerPrices,
  exportDevice,
  pricesRequestSchema,
  SameDeviceError,
  SCHEMA_VERSION,
  UnsupportedSchemaVersionError,
  type Effect,
  type Exchange,
  type StoredPrices,
} from "~/core/sync";

import {
  applyState,
  exportState,
  type PlanCounts,
  type SyncStore,
} from "./sync";
import { newSyncToken, type PairingRegistry } from "./sync-pairing";

const MAX_NAME_LENGTH = 100;
const FREE_FAILURES = 5;
const MAX_BACKOFF_MS = 60_000;
const RETRY_AFTER_BUSY_SECONDS = "1";

export type { SyncRequest, SyncResponse };

export interface SyncApiDeps {
  serverName: () => string;
  store: SyncStore;
  devices: { find(deviceId: string): PairedDevice | null };
  saveDevice: (
    tx: SyncTx,
    device: { deviceId: string; name: string; tokenHash: string },
    now: Date,
  ) => void;
  recordSync: (
    tx: SyncTx,
    deviceId: string,
    sync: { at: Date; address: string; counts: string },
  ) => void;
  prices: {
    read(tx: SyncTx, ids: readonly string[]): Map<string, StoredPrices>;
  };
  pairing: PairingRegistry;
  throttle: AuthThrottle;
  beforeApply: () => void;
  effects: {
    enqueue(deviceId: string, effects: readonly Effect[]): void;
    pending(): ReadonlySet<string>;
  };
  now: () => Date;
}

export class AuthThrottle {
  private failures = 0;
  private blockedUntil = 0;

  retryAfterMs(nowMs: number): number {
    return Math.max(0, this.blockedUntil - nowMs);
  }

  failed(nowMs: number): void {
    this.failures += 1;
    if (this.failures > FREE_FAILURES) {
      const wait = 1000 * 2 ** (this.failures - FREE_FAILURES - 1);
      this.blockedUntil = nowMs + Math.min(wait, MAX_BACKOFF_MS);
    }
  }

  succeeded(): void {
    this.failures = 0;
    this.blockedUntil = 0;
  }
}

export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function stateEtag(exchange: Exchange): string {
  const { exportHlc: _exportHlc, ...state } = exchange;
  const hash = createHash("sha256").update(JSON.stringify(state)).digest("hex");
  return `"${hash}"`;
}

const failure = (
  status: number,
  error: string,
  extra: Record<string, unknown> = {},
  headers?: Record<string, string>,
): SyncResponse => ({
  status,
  body: { error, ...extra },
  ...(headers ? { headers } : {}),
});

const pairRequestSchema = z.object({
  token: z.string().min(1),
  deviceId: z.string().min(1),
  name: z.string().min(1).max(MAX_NAME_LENGTH),
});

async function pair(
  deps: SyncApiDeps,
  request: SyncRequest,
): Promise<SyncResponse> {
  const parsed = pairRequestSchema.safeParse(request.body);
  if (!parsed.success) return failure(400, "invalid-request");
  const { token, deviceId, name } = parsed.data;

  const nowMs = deps.now().getTime();
  const answer = await deps.pairing.request(
    token,
    deviceId,
    name,
    request.signal,
  );
  switch (answer.kind) {
    case "invalid-token":
      deps.throttle.failed(nowMs);
      return failure(401, "invalid-token");
    case "rejected":
      return failure(403, "rejected");
    case "expired":
      return failure(410, "expired");
    case "confirmed":
  }

  const deviceToken = newSyncToken();
  try {
    await deps.store.transaction((tx) =>
      deps.saveDevice(
        tx,
        { deviceId, name, tokenHash: hashToken(deviceToken) },
        deps.now(),
      ),
    );
  } catch (error) {
    deps.pairing.failed();
    throw error;
  }
  deps.throttle.succeeded();
  return { status: 200, body: { token: deviceToken } };
}

function authenticate(
  deps: SyncApiDeps,
  request: SyncRequest,
): { device: PairedDevice } | { refusal: SyncResponse } {
  const nowMs = deps.now().getTime();
  const token = request.authorization?.match(/^Bearer (.+)$/)?.[1];
  const device = request.deviceId ? deps.devices.find(request.deviceId) : null;
  if (!token || !device || !sameHash(hashToken(token), device.tokenHash)) {
    deps.throttle.failed(nowMs);
    return { refusal: failure(401, "unauthorized") };
  }
  deps.throttle.succeeded();
  if (device.revokedAt) return { refusal: failure(403, "revoked") };
  return { device };
}

function updateSide(found: unknown): "server" | "client" {
  return typeof found === "number" && found > SCHEMA_VERSION
    ? "server"
    : "client";
}

async function postSync(
  deps: SyncApiDeps,
  request: SyncRequest,
  device: PairedDevice,
): Promise<SyncResponse> {
  const claimed = (request.body as { deviceId?: unknown } | null)?.deviceId;
  if (claimed !== device.deviceId) return failure(403, "device-mismatch");

  const current = await deps.store.transaction((tx) => {
    const { device: local, name } = tx.read();
    const exported = exportDevice(
      local,
      deps.now().getTime(),
      name ?? deps.serverName(),
    );
    return stateEtag(exported.exchange);
  });
  if (request.ifMatch !== current) return failure(409, "state-changed");

  const now = deps.now();
  const result = await applyState(
    {
      store: deps.store,
      beforeApply: deps.beforeApply,
      settled: (tx, { counts }) =>
        deps.recordSync(tx, device.deviceId, {
          at: now,
          address: request.address,
          counts: JSON.stringify(counts satisfies PlanCounts),
        }),
      now,
    },
    request.body,
    { dryRun: false },
  );
  if (result.status === "applied") {
    deps.effects.enqueue(device.deviceId, result.plan.effects);
  }
  return {
    status: 200,
    body: {
      status: result.status,
      counts: result.counts,
      setAside: result.plan.setAside.map((row) => row.key),
    },
  };
}

async function postPrices(
  deps: SyncApiDeps,
  request: SyncRequest,
): Promise<SyncResponse> {
  const parsed = pricesRequestSchema.safeParse(request.body);
  if (!parsed.success) return failure(400, "invalid-request");

  const { instruments } = parsed.data;
  const ids = instruments.map((i) => i.instrumentId);
  const stored = await deps.store.transaction((tx) =>
    deps.prices.read(tx, ids),
  );
  const pending = deps.effects.pending();
  return {
    status: 200,
    body: {
      instruments: instruments.map((holding) =>
        answerPrices(
          stored.get(holding.instrumentId) ?? {
            seriesVersion: randomUUID(),
            rows: [],
          },
          holding,
          pending.has(holding.instrumentId),
        ),
      ),
    },
  };
}

async function route(
  deps: SyncApiDeps,
  request: SyncRequest,
): Promise<SyncResponse> {
  const key = `${request.method} ${request.path}`;
  if (key === "GET /v1/hello") {
    return {
      status: 200,
      body: { versions: [SCHEMA_VERSION], name: deps.serverName() },
    };
  }

  const wait = deps.throttle.retryAfterMs(deps.now().getTime());
  if (wait > 0) {
    return failure(
      429,
      "too-many-attempts",
      {},
      {
        "Retry-After": String(Math.ceil(wait / 1000)),
      },
    );
  }
  if (key === "POST /v1/pair") return pair(deps, request);
  if (
    key !== "GET /v1/sync" &&
    key !== "POST /v1/sync" &&
    key !== "POST /v1/prices"
  ) {
    return failure(404, "not-found");
  }

  const auth = authenticate(deps, request);
  if ("refusal" in auth) return auth.refusal;

  if (key === "POST /v1/prices") return postPrices(deps, request);
  if (key === "POST /v1/sync") return postSync(deps, request, auth.device);

  const exchange = await exportState(
    deps.store,
    deps.now(),
    deps.serverName(),
  );
  return {
    status: 200,
    body: exchange,
    headers: { ETag: stateEtag(exchange) },
  };
}

export async function handleSyncRequest(
  deps: SyncApiDeps,
  request: SyncRequest,
): Promise<SyncResponse> {
  try {
    return await route(deps, request);
  } catch (error) {
    if (error instanceof SyncBusyError) {
      return failure(
        503,
        "busy",
        {},
        {
          "Retry-After": RETRY_AFTER_BUSY_SECONDS,
        },
      );
    }
    if (error instanceof UnsupportedSchemaVersionError) {
      return failure(400, "unsupported-schema-version", {
        found: error.found ?? null,
        supported: [SCHEMA_VERSION],
        update: updateSide(error.found),
      });
    }
    if (error instanceof SameDeviceError) return failure(400, "same-device");
    if (error instanceof ZodError) return failure(400, "invalid-exchange");
    throw error;
  }
}
