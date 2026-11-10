import { z } from "zod";

import type { Copy } from "./i18n";
import type { PairingState } from "./sync-pairing";

export const MAX_SERVER_NAME_LENGTH = 100;

export interface DeviceView {
  deviceId: string;
  name: string;
  pairedAt: string;
  lastSyncAt: string | null;
  lastAddress: string | null;
  lastCounts: string | null;
  revokedAt: string | null;
}

export interface DevicesView {
  devices: DeviceView[];
  host: string | null;
  proposals: string[];
  port: number;
  name: string | null;
  defaultName: string;
  database: { path: string; kind: "ledger" | "scratch" | "other" } | null;
}

export type DevicesError =
  | "invalid-host"
  | "invalid-port"
  | "invalid-name"
  | "need-address"
  | "port-unavailable"
  | "refused";

export type DevicesResponse =
  | { ok: false; error: DevicesError; port?: number }
  | {
      ok: true;
      state?: PairingState;
      pairing?: { svg: string; expiresInMs: number };
    };

export interface DevicesPoll {
  state: PairingState;
  devices: DeviceView[];
}

const DOTTED_NUMBERS = /^[\d.]+$/;
const HOST_NAME =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?)$/i;

export function parseHost(raw: string): string | null {
  const host = raw.trim();
  if (DOTTED_NUMBERS.test(host)) {
    return z.ipv4().safeParse(host).success ? host : null;
  }
  return HOST_NAME.test(host) ? host : null;
}

export function parsePort(raw: string): number | null {
  if (!/^\d{1,5}$/.test(raw.trim())) return null;
  const port = Number(raw);
  return port >= 1 && port <= 65535 ? port : null;
}

export function parseServerName(raw: string): string | null | undefined {
  const name = raw.trim();
  if (name.length === 0) return null;
  return name.length <= MAX_SERVER_NAME_LENGTH ? name : undefined;
}

type Interfaces = Record<
  string,
  readonly { family: string; address: string; internal: boolean }[] | undefined
>;

function lanRank(address: string): number | null {
  if (address.startsWith("169.254.")) return null;
  if (address.startsWith("192.168.")) return 0;
  if (address.startsWith("10.")) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2;
  return 3;
}

export function proposeHosts(input: {
  docker: boolean;
  interfaces: Interfaces;
  browserHost: string;
}): string[] {
  if (input.docker) {
    const host = parseHost(input.browserHost);
    return host && !LOOPBACK.test(host) ? [host] : [];
  }
  const found = Object.values(input.interfaces)
    .flatMap((addresses) => addresses ?? [])
    .filter((info) => info.family === "IPv4" && !info.internal)
    .map((info) => info.address)
    .filter((address) => lanRank(address) !== null);
  return [...new Set(found)].sort(
    (a, b) => (lanRank(a) ?? 0) - (lanRank(b) ?? 0) || a.localeCompare(b),
  );
}

export function pairingPayload(fields: {
  host: string;
  port: number;
  sha256: string;
  token: string;
  name: string;
}): string {
  return JSON.stringify({
    v: 1,
    host: fields.host,
    port: fields.port,
    sha256: fields.sha256,
    token: fields.token,
    name: fields.name,
  });
}

export function formatCountdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const count = z.number().int().nonnegative().catch(0).default(0);
const lastCountsSchema = z.object({
  ledger: count,
  inKind: count,
  setAside: count,
  newInstruments: count,
  changedInstruments: count,
  newTargets: count,
  deletedTargets: count,
  newHoldings: count,
  replacedHoldings: count,
  newIdentities: count,
  updatedIdentities: count,
  settings: z.boolean().catch(false).default(false),
  failedPrices: count,
  failedRates: count,
});

export interface DeviceSyncSummary {
  changes: string[];
  failedPrices: number;
  failedRates: number;
}

function parseLastCounts(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function summarizeLastSync(
  raw: string | null,
  copy: Copy["settings"]["devices"]["counts"],
): DeviceSyncSummary {
  const parsed = lastCountsSchema.safeParse(parseLastCounts(raw ?? "{}"));
  const counts = parsed.success ? parsed.data : lastCountsSchema.parse({});
  const part = (n: number, text: (n: number) => string) =>
    n > 0 ? [text(n)] : [];
  const changes = [
    ...part(counts.ledger + counts.inKind, copy.ledger),
    ...part(
      counts.newInstruments + counts.changedInstruments,
      copy.instruments,
    ),
    ...part(counts.newTargets + counts.deletedTargets, copy.targets),
    ...part(counts.newHoldings + counts.replacedHoldings, copy.holdings),
    ...part(counts.newIdentities + counts.updatedIdentities, copy.identities),
    ...(counts.settings ? [copy.settings] : []),
    ...part(counts.setAside, copy.setAside),
  ];
  return {
    changes: changes.length > 0 ? changes : [copy.none],
    failedPrices: counts.failedPrices,
    failedRates: counts.failedRates,
  };
}
