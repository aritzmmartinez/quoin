import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { pairingCode } from "../../app/lib/sync-pairing";

import { contractJson } from "./build";

export interface SyncPairingInput {
  name: string;
  token: string;
  deviceId: string;
}

export const SYNC_PAIRING_CONTRACT_FILE = fileURLToPath(
  new URL("./sync-pairing.json", import.meta.url),
);

const openssl = (deviceId: string, token: string, bytes: string, value: string) =>
  `printf '${deviceId}' | openssl dgst -sha256 -hmac ${token} starts ${bytes}; as an unsigned integer ${value}; its last six digits.`;

const cases: (SyncPairingInput & {
  byHand: { arithmetic: string; figures: Record<string, string | null> };
})[] = [
  {
    name: "a first byte with its top bit set stays unsigned",
    token: "test-token",
    deviceId: "dev-phone",
    byHand: {
      arithmetic: openssl("dev-phone", "test-token", "877d42e8", "2273133288"),
      figures: { code: "133288" },
    },
  },
  {
    name: "a first byte with its top bit clear",
    token: "tok-b",
    deviceId: "phone-1",
    byHand: {
      arithmetic: openssl("phone-1", "tok-b", "7c5e525c", "2086556252"),
      figures: { code: "556252" },
    },
  },
  {
    name: "a small remainder keeps its leading zeros",
    token: "tok-zero",
    deviceId: "phone-36",
    byHand: {
      arithmetic: openssl("phone-36", "tok-zero", "e2426c60", "3796003936"),
      figures: { code: "003936" },
    },
  },
  {
    name: "a device id is hashed as UTF-8",
    token: "tok-a",
    deviceId: "móvil-ñ",
    byHand: {
      arithmetic: openssl(
        "m\\xc3\\xb3vil-\\xc3\\xb1",
        "tok-a",
        "c5fd700c",
        "3321720844",
      ),
      figures: { code: "720844" },
    },
  },
];

export const evaluate = ({ token, deviceId }: SyncPairingInput) => ({
  code: pairingCode(token, deviceId),
});

export function syncPairingContractJson(): string {
  return contractJson(
    "sync-pairing",
    "The six digits both screens show while pairing: HMAC-SHA256 with the token as key over the device id, both as UTF-8; the first four bytes of the digest as a big-endian unsigned integer, modulo 1000000, left-padded with zeros to six digits. Shared with the mobile client.",
    cases.map((c) => ({ ...c, expect: evaluate(c) })),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(SYNC_PAIRING_CONTRACT_FILE, syncPairingContractJson());
}
