import { resolve } from "node:path";

export const REAL_DATABASE_FILE = "data/quoin.sqlite";
export const SCRATCH_DATABASE_FILE = "data/dev.sqlite";

export type DatabaseTarget =
  | { kind: "ledger" | "scratch" | "other"; path: string }
  | { kind: "unresolved"; url: string | undefined };

export function resolveDatabasePath(
  url: string | undefined,
  root: string,
): string | null {
  if (!url) return null;
  if (!url.startsWith("file:")) return null;

  const target = url.slice("file:".length);
  if (target === "" || target === ":memory:") return null;

  return resolve(root, target);
}

export function samePath(a: string, b: string): boolean {
  return process.platform === "win32"
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
}

export function classifyDatabaseIn(
  url: string | undefined,
  root: string,
): DatabaseTarget {
  const path = resolveDatabasePath(url, root);
  if (path === null) return { kind: "unresolved", url };
  if (samePath(path, resolve(root, REAL_DATABASE_FILE))) {
    return { kind: "ledger", path };
  }
  if (samePath(path, resolve(root, SCRATCH_DATABASE_FILE))) {
    return { kind: "scratch", path };
  }
  return { kind: "other", path };
}

const KIND_LABEL = {
  ledger: "LIVE LEDGER, real trades",
  scratch: "scratch database",
} as const;

export function describeDatabase(
  target: DatabaseTarget,
  exists: boolean,
): string {
  if (target.kind === "unresolved") {
    const url = target.url ? `"${target.url}"` : "not set";
    return `Database: DATABASE_URL is ${url}, which does not resolve to a local SQLite file`;
  }

  const missing = exists ? "" : ", does not exist yet";
  if (target.kind === "other") {
    return (
      `Database: ${target.path} — not the live ledger (${REAL_DATABASE_FILE}) ` +
      `nor the scratch database (${SCRATCH_DATABASE_FILE})${missing}`
    );
  }
  return `Database: ${target.path} (${KIND_LABEL[target.kind]}${missing})`;
}
