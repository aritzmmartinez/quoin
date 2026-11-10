import { createHash, createPrivateKey, X509Certificate } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { createSecureContext } from "node:tls";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadTlsIdentity } from "./identity";

const NOW = new Date("2026-11-07T10:00:00.000Z");
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "quoin-identity-"));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("loadTlsIdentity", () => {
  it("generates a P-256 certificate that TLS accepts, with no address in it", async () => {
    const identity = await loadTlsIdentity(join(directory, "sync"), NOW);
    const cert = new X509Certificate(identity.cert);

    expect(cert.publicKey.asymmetricKeyType).toBe("ec");
    expect(cert.publicKey.asymmetricKeyDetails?.namedCurve).toBe("prime256v1");
    expect(cert.subject).toBe("CN=Quoin");
    expect(cert.subjectAltName).toBeUndefined();
    expect(new Date(cert.validTo).getTime()).toBeGreaterThan(
      Date.UTC(2120, 0, 1),
    );
    expect(cert.checkPrivateKey(createPrivateKey(identity.key))).toBe(true);
    expect(() =>
      createSecureContext({ key: identity.key, cert: identity.cert }),
    ).not.toThrow();
  });

  it("states the fingerprint as lowercase hex of the certificate's bytes", async () => {
    const identity = await loadTlsIdentity(directory, NOW);
    const raw = new X509Certificate(identity.cert).raw;

    expect(identity.sha256).toBe(
      createHash("sha256").update(raw).digest("hex"),
    );
    expect(identity.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps the same identity across starts: a phone's pin depends on it", async () => {
    const first = await loadTlsIdentity(directory, NOW);
    const second = await loadTlsIdentity(directory, NOW);

    expect(second).toEqual(first);
    expect(readFileSync(join(directory, "key.pem"), "utf8")).toBe(first.key);
  });

  it("generates both again when a crash left only the key", async () => {
    const first = await loadTlsIdentity(directory, NOW);
    rmSync(join(directory, "cert.pem"));

    const second = await loadTlsIdentity(directory, NOW);

    expect(second.sha256).not.toBe(first.sha256);
    expect(second.key).not.toBe(first.key);
  });

  it("leaves no partial file behind", async () => {
    await loadTlsIdentity(directory, NOW);
    expect(existsSync(join(directory, "key.pem.tmp"))).toBe(false);
    expect(existsSync(join(directory, "cert.pem.tmp"))).toBe(false);
  });

  it.skipIf(process.platform === "win32")(
    "keeps the private key readable by its owner alone",
    async () => {
      await loadTlsIdentity(directory, NOW);
      expect(statSync(join(directory, "key.pem")).mode & 0o777).toBe(0o600);
    },
  );
});
