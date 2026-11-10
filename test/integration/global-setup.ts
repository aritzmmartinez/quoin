import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execPath } from "node:process";

import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    templateDatabase: string;
  }
}

export default function setup(project: TestProject): () => void {
  const dir = mkdtempSync(join(tmpdir(), "quoin-template-"));
  const file = join(dir, "template.sqlite");
  execFileSync(
    execPath,
    [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
    {
      stdio: "ignore",
      env: {
        ...process.env,
        DATABASE_URL: `file:${file.replaceAll("\\", "/")}`,
      },
    },
  );
  project.provide("templateDatabase", file);
  return () => rmSync(dir, { recursive: true, force: true });
}
