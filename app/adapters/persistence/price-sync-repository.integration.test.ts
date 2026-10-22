import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

let repo: InstanceType<
  typeof import("./price-sync-repository").PrismaPriceSyncRepository
>;
let disconnect: () => Promise<void>;

const tmpDir = "./.tmp-price-sync";
const dbPath = `${tmpDir}/it-${Date.now()}.sqlite`;

beforeAll(async () => {
  mkdirSync(tmpDir, { recursive: true });
  const dbUrl = `file:${dbPath}`;
  process.env.DATABASE_URL = dbUrl;
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: dbUrl },
  });

  const persistence = await import("./index");
  repo = new persistence.PrismaPriceSyncRepository();
  disconnect = () => persistence.prisma.$disconnect();
});

afterAll(async () => {
  if (disconnect) await disconnect();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("PrismaPriceSyncRepository (integration)", () => {
  it("has no check for an instrument never asked about", async () => {
    expect(await repo.lastChecked()).toEqual(new Map());
  });

  it("records a check per instrument and moves it forward on the next one", async () => {
    await repo.markChecked("IE00TEST0001");
    const first = (await repo.lastChecked()).get("IE00TEST0001");
    expect(first).toBeInstanceOf(Date);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await repo.markChecked("IE00TEST0001");
    await repo.markChecked("US00TEST0001");
    const checked = await repo.lastChecked();

    expect(checked.size).toBe(2);
    expect(checked.get("IE00TEST0001")!.getTime()).toBeGreaterThan(
      first!.getTime(),
    );
  });

  it("records a check for an instrument with no row, which it does not require", async () => {
    await expect(repo.markChecked("NOT-AN-INSTRUMENT")).resolves.toBeUndefined();
  });
});
