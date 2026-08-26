import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Integration tests only. Run with `pnpm test:integration`. Needs a real DB and the
// generated Prisma client, so it's kept out of the default (unit) test run.
export default defineConfig({
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./app", import.meta.url)),
    },
  },
  test: {
    include: [
      "app/**/*.integration.test.ts",
      "scripts/**/*.integration.test.ts",
    ],
    // `beforeAll` shells out to `prisma migrate deploy`; a cold pnpm + Prisma
    // engine start is well over the 10s default, especially on Windows / CI.
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
