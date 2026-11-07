import { networkInterfaces } from "node:os";

import { renderSVG } from "uqr";

import {
  databasePath,
  PrismaPairedDeviceRepository,
  SqlitePairedDevices,
} from "~/adapters/persistence";

import {
  pairingPayload,
  parseHost,
  parsePort,
  parseServerName,
  proposeHosts,
  type DeviceView,
  type DevicesPoll,
  type DevicesResponse,
  type DevicesView,
} from "./sync-devices";
import { defaultServerName, inDocker } from "./sync.server";
import { ensureListener, syncPairing } from "./sync-server.server";

const proposalsFor = (request: Request): string[] =>
  proposeHosts({
    docker: inDocker(),
    interfaces: networkInterfaces(),
    browserHost: new URL(request.url).hostname,
  });

// Field by field: the token's hash never reaches the browser.
export async function listDevices(): Promise<DeviceView[]> {
  const devices = await new PrismaPairedDeviceRepository().list();
  return devices.map((device) => ({
    deviceId: device.deviceId,
    name: device.name,
    pairedAt: device.pairedAt.toISOString(),
    lastSyncAt: device.lastSyncAt?.toISOString() ?? null,
    lastAddress: device.lastAddress,
    lastCounts: device.lastCounts,
    revokedAt: device.revokedAt?.toISOString() ?? null,
  }));
}

export async function loadDevices(request: Request): Promise<DevicesView> {
  const repository = new PrismaPairedDeviceRepository();
  const [devices, address, name] = await Promise.all([
    listDevices(),
    repository.address(),
    repository.serverName(),
  ]);
  return {
    devices,
    host: address.host,
    proposals: proposalsFor(request),
    port: address.port,
    name,
    defaultName: defaultServerName(),
  };
}

const field = (form: FormData, name: string): string =>
  String(form.get(name) ?? "");

async function saveHost(form: FormData): Promise<DevicesResponse> {
  const raw = field(form, "host").trim();
  const host = raw === "" ? null : parseHost(raw);
  if (raw !== "" && host === null) return { ok: false, error: "invalid-host" };
  await new PrismaPairedDeviceRepository().setAddress({ host });
  return { ok: true };
}

async function savePort(form: FormData): Promise<DevicesResponse> {
  const port = parsePort(field(form, "port"));
  if (port === null) return { ok: false, error: "invalid-port" };

  await new PrismaPairedDeviceRepository().setAddress({ port });

  if (!new SqlitePairedDevices(databasePath()).hasActive()) return { ok: true };
  try {
    await ensureListener();
    return { ok: true };
  } catch (error) {
    console.error("quoin sync: the listener could not start", error);
    return { ok: false, error: "port-unavailable", port };
  }
}

async function startPairing(request: Request): Promise<DevicesResponse> {
  const repository = new PrismaPairedDeviceRepository();
  const [address, name] = await Promise.all([
    repository.address(),
    repository.serverName(),
  ]);
  const host = address.host ?? proposalsFor(request)[0];
  if (!host) return { ok: false, error: "need-address" };

  let sha256: string;
  try {
    ({ sha256 } = await ensureListener());
  } catch (error) {
    console.error("quoin sync: the listener could not start", error);
    return { ok: false, error: "port-unavailable", port: address.port };
  }

  const pairing = syncPairing();
  const now = Date.now();
  const { token, expiresAt } = pairing.start(now);
  return {
    ok: true,
    state: pairing.state(),
    pairing: {
      svg: renderSVG(
        pairingPayload({
          host,
          port: address.port,
          sha256,
          token,
          name: name ?? defaultServerName(),
        }),
        { ecc: "M" },
      ),
      expiresInMs: expiresAt - now,
    },
  };
}

export async function devicesAction(
  request: Request,
): Promise<DevicesResponse> {
  if (request.headers.get("Sec-Fetch-Site") === "cross-site") {
    return { ok: false, error: "refused" };
  }

  const form = await request.formData();
  const pairing = syncPairing();
  const repository = new PrismaPairedDeviceRepository();

  switch (field(form, "intent")) {
    case "save-host":
      return saveHost(form);
    case "save-port":
      return savePort(form);
    case "save-name": {
      const name = parseServerName(field(form, "name"));
      if (name === undefined) return { ok: false, error: "invalid-name" };
      await repository.setServerName(name);
      return { ok: true };
    }
    case "pair-start":
      return startPairing(request);
    case "pair-confirm":
      pairing.confirm();
      return { ok: true, state: pairing.state() };
    case "pair-reject":
      pairing.reject();
      return { ok: true, state: pairing.state() };
    case "pair-cancel":
      pairing.cancel();
      return { ok: true, state: pairing.state() };
    case "revoke":
      await repository.revoke(field(form, "deviceId"), new Date());
      return { ok: true };
    default:
      return { ok: false, error: "refused" };
  }
}

export const pairingState = () => syncPairing().state();

export const pollDevices = async (): Promise<DevicesPoll> => ({
  state: pairingState(),
  devices: await listDevices(),
});
