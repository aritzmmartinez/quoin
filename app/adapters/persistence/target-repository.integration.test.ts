import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PortfolioTarget } from "~/core/domain";

let persistence: typeof import("./index");

const tmpDir = "./.tmp-target";
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

const version = (id: string, activeFrom: string): PortfolioTarget => ({
  id,
  name: id,
  activeFrom,
  note: null,
  createdAt: new Date("2026-10-28T10:00:00Z"),
  lines: [{ instrumentId: "XS00TEST0001", monthlyAmount: "300" }],
});

describe("PrismaTargetRepository (integration)", () => {
  it("stores activeFrom as the calendar day it was given", async () => {
    const repo = new persistence.PrismaTargetRepository();
    await repo.create(version("v1", "2026-11-01"));
    const [stored] = await repo.list();
    expect(stored?.activeFrom).toBe("2026-11-01");
  });

  it("refuses an activeFrom that is not a calendar day before writing", async () => {
    const repo = new persistence.PrismaTargetRepository();
    await expect(
      repo.create(version("bad", "2026-11-01T00:00:00.000Z")),
    ).rejects.toThrow();
    expect((await repo.list()).map((t) => t.id)).toEqual(["v1"]);
  });

  it("refuses a second version on the same day at the database too", async () => {
    const repo = new persistence.PrismaTargetRepository();
    await expect(repo.create(version("v2", "2026-11-01"))).rejects.toThrow();
    expect((await repo.list()).map((t) => t.id)).toEqual(["v1"]);
  });
});
