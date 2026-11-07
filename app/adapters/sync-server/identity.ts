import { createHash, randomBytes, X509Certificate } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const VALIDITY_MS = 100 * 365 * 24 * 60 * 60 * 1000;
const ALGORITHM = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };

export interface TlsIdentity {
  key: string;
  cert: string;
  sha256: string;
}

async function generate(now: Date): Promise<{ key: string; cert: string }> {
  await import("reflect-metadata");
  const x509 = await import("@peculiar/x509");

  const keys = await crypto.subtle.generateKey(ALGORITHM, true, [
    "sign",
    "verify",
  ]);
  const cert = await x509.X509CertificateGenerator.createSelfSigned(
    {
      serialNumber: `01${randomBytes(16).toString("hex")}`,
      name: "CN=Quoin",
      notBefore: now,
      notAfter: new Date(now.getTime() + VALIDITY_MS),
      signingAlgorithm: ALGORITHM,
      keys,
    },
    crypto,
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
  return {
    key: x509.PemConverter.encode(pkcs8, "PRIVATE KEY"),
    cert: cert.toString("pem"),
  };
}

function writeAtomically(path: string, content: string, mode: number): void {
  const partial = `${path}.tmp`;
  writeFileSync(partial, content, { mode });
  renameSync(partial, path);
}

export async function loadTlsIdentity(
  directory: string,
  now: Date,
): Promise<TlsIdentity> {
  const keyPath = join(directory, "key.pem");
  const certPath = join(directory, "cert.pem");

  if (!existsSync(keyPath) || !existsSync(certPath)) {
    const { key, cert } = await generate(now);
    mkdirSync(directory, { recursive: true });
    writeAtomically(keyPath, key, 0o600);
    writeAtomically(certPath, cert, 0o644);
  }

  const cert = readFileSync(certPath, "utf8");
  return {
    key: readFileSync(keyPath, "utf8"),
    cert,
    sha256: createHash("sha256")
      .update(new X509Certificate(cert).raw)
      .digest("hex"),
  };
}
