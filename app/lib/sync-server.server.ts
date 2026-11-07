import { hostname } from "node:os";
import { dirname, join } from "node:path";

import Database from "better-sqlite3";

import {
  databasePath,
  DEFAULT_SYNC_PORT,
  readStoredPrices,
  recordDeviceSync,
  recordEffectFailures,
  savePairedDevice,
  SqlitePairedDevices,
  SqliteSyncStore,
} from "~/adapters/persistence";
import { backupBeforeSync } from "~/adapters/persistence/sync-backup";
import { loadTlsIdentity } from "~/adapters/sync-server/identity";
import { listen } from "~/adapters/sync-server/listener";
import { today } from "~/core/calendar";

import { describeFailure } from "./describe-failure";
import type { RunEffect } from "./sync";
import { runEffect } from "./sync.server";
import { AuthThrottle, handleSyncRequest } from "./sync-api";
import { EffectQueue } from "./sync-effects";
import { PairingRegistry } from "./sync-pairing";

const BACKUP_ZONE = "Europe/Madrid";

const inDocker = () => process.env.QUOIN_RUNTIME === "docker";

const report = (error: unknown) => {
  console.error(`quoin sync: ${describeFailure(error)}`);
};

export interface SyncServerOptions {
  databaseFile: string;
  dataDirectory: string;
  port: number;
  pairing: PairingRegistry;
  throttle: AuthThrottle;
  runEffect: RunEffect;
  now: () => Date;
}

export interface RunningSyncServer {
  port: number;
  sha256: string;
  effects: EffectQueue;
  close(): Promise<void>;
}

export async function startSyncServer(
  options: SyncServerOptions,
): Promise<RunningSyncServer> {
  const { databaseFile, dataDirectory, now } = options;
  const { key, cert, sha256 } = await loadTlsIdentity(
    join(dataDirectory, "sync"),
    now(),
  );
  const store = new SqliteSyncStore(databaseFile);
  const effects = new EffectQueue({
    run: options.runEffect,
    record: (deviceId, failures) =>
      store.transaction((tx) => recordEffectFailures(tx, deviceId, failures)),
    onError: report,
  });

  try {
    const listener = await listen({
      key,
      cert,
      port: options.port,
      onError: report,
      handle: (request) =>
        handleSyncRequest(
          {
            serverName: () => (inDocker() ? "Quoin" : hostname()),
            store,
            devices: new SqlitePairedDevices(databaseFile),
            saveDevice: savePairedDevice,
            recordSync: recordDeviceSync,
            prices: { read: readStoredPrices },
            pairing: options.pairing,
            throttle: options.throttle,
            beforeApply: () => {
              backupBeforeSync(
                databaseFile,
                join(dataDirectory, "backups", "sync"),
                today(BACKUP_ZONE, now()),
              );
            },
            effects,
            now,
          },
          request,
        ),
    });
    return {
      port: listener.port,
      sha256,
      effects,
      close: async () => {
        effects.stop();
        options.pairing.cancel();
        await listener.close();
        store.close();
      },
    };
  } catch (error) {
    store.close();
    throw error;
  }
}

interface Runtime {
  pairing: PairingRegistry;
  throttle: AuthThrottle;
  server: Promise<RunningSyncServer | null>;
  signals: boolean;
}

const holder = globalThis as { __quoinSyncServer?: Runtime };

function runtime(): Runtime {
  holder.__quoinSyncServer ??= {
    pairing: new PairingRegistry(),
    throttle: new AuthThrottle(),
    server: Promise.resolve(null),
    signals: false,
  };
  return holder.__quoinSyncServer;
}

export const syncPairing = (): PairingRegistry => runtime().pairing;

function closeOnSignals(state: Runtime): void {
  if (state.signals || process.env.NODE_ENV !== "production") return;
  state.signals = true;
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      void state.server.then((server) => server?.close()).catch(report);
    });
  }
}

export function ensureListener(): Promise<RunningSyncServer> {
  const state = runtime();
  const file = databasePath();
  const next = state.server
    .catch(() => null)
    .then(async (current) => {
      const port = inDocker()
        ? DEFAULT_SYNC_PORT
        : new SqlitePairedDevices(file).port();
      if (current?.port === port) return current;
      await current?.close();
      closeOnSignals(state);
      return startSyncServer({
        databaseFile: file,
        dataDirectory: dirname(file),
        port,
        pairing: state.pairing,
        throttle: state.throttle,
        runEffect,
        now: () => new Date(),
      });
    });
  state.server = next;
  return next;
}

function noDatabaseYet(error: unknown): boolean {
  return (
    error instanceof Database.SqliteError &&
    (error.code === "SQLITE_CANTOPEN" || /no such table/.test(error.message))
  );
}

export async function startListenerIfPaired(): Promise<void> {
  try {
    if (new SqlitePairedDevices(databasePath()).hasActive()) {
      await ensureListener();
    }
  } catch (error) {
    if (!noDatabaseYet(error)) report(error);
  }
}
