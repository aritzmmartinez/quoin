import { readFileSync } from "node:fs";
import { join } from "node:path";

function readVersion(): string {
  const pkgPath = join(process.cwd(), "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
  return pkg.version ?? "0.0.0";
}

export const APP_VERSION = readVersion();
