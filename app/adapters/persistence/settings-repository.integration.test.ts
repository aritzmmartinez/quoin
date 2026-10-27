import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Residence } from "~/core/domain";

let persistence: typeof import("./index");

const tmpDir = "./.tmp-settings";
const dbPath = `${tmpDir}/it-${Date.now()}.sqlite`;

beforeAll(async () => {
  mkdirSync(tmpDir, { recursive: true });
  const dbUrl = `file:${dbPath}`;
  process.env.DATABASE_URL = dbUrl;
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: dbUrl },
  });
  persistence = await import("./index");
});

afterAll(async () => {
  if (persistence) await persistence.prisma.$disconnect();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("PrismaSettingsRepository (integration)", () => {
  it("starts from the row the migration writes: resident in Bizkaia", async () => {
    expect(await new persistence.PrismaSettingsRepository().residence()).toBe(
      "bizkaia",
    );
  });

  it("refuses to write a residence the domain does not know", async () => {
    const repo = new persistence.PrismaSettingsRepository();
    await expect(repo.setResidence("canarias" as Residence)).rejects.toThrow();
    expect(await repo.residence()).toBe("bizkaia");
  });

  it("keeps a single row: the CHECK refuses a second one", async () => {
    await expect(
      persistence.prisma.$executeRawUnsafe(
        `INSERT INTO "Settings" ("id", "residence") VALUES (2, 'bizkaia')`,
      ),
    ).rejects.toThrow();
  });

  it("refuses to read a residence written past the domain, instead of guessing one", async () => {
    await persistence.prisma.$executeRawUnsafe(
      `UPDATE "Settings" SET "residence" = 'atlantis' WHERE "id" = 1`,
    );
    await expect(
      new persistence.PrismaSettingsRepository().residence(),
    ).rejects.toThrow();
    await persistence.prisma.$executeRawUnsafe(
      `UPDATE "Settings" SET "residence" = 'bizkaia' WHERE "id" = 1`,
    );
  });
});
