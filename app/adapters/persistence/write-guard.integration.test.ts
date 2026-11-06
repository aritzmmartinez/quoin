import { mkdirSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migratedDatabase } from "../../../test/integration/template";

type Persistence = typeof import("./index");

let persistence: Persistence;

const tmpDir = "./.tmp-write-guard";
const dbPath = `${tmpDir}/it-${Date.now()}.sqlite`;
const REFUSED = /A write outside a transaction was refused/;
const NOW = new Date("2026-01-05T00:00:00.000Z");

const check = (instrumentId: string) => ({
  where: { instrumentId },
  create: { instrumentId, checkedAt: NOW },
  update: { checkedAt: NOW },
});

const stored = async (instrumentId: string) =>
  persistence.prisma.priceSync.count({ where: { instrumentId } });

beforeAll(async () => {
  mkdirSync(tmpDir, { recursive: true });
  process.env.DATABASE_URL = `file:${dbPath}`;
  migratedDatabase(dbPath);
  persistence = await import("./index");
});

afterAll(async () => {
  await persistence.prisma.$disconnect();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("a write outside a transaction (integration)", () => {
  it.each<[string, (id: string) => Promise<unknown>]>([
    ["upsert", (id) => persistence.prisma.priceSync.upsert(check(id))],
    [
      "create",
      (id) =>
        persistence.prisma.priceSync.create({
          data: { instrumentId: id, checkedAt: NOW },
        }),
    ],
    [
      "createMany",
      (id) =>
        persistence.prisma.priceSync.createMany({
          data: [{ instrumentId: id, checkedAt: NOW }],
        }),
    ],
    [
      "$executeRaw",
      (id) =>
        persistence.prisma.$executeRawUnsafe(
          `INSERT INTO "PriceSync" VALUES ('${id}', 0)`,
        ),
    ],
    [
      "$queryRaw",
      (id) =>
        persistence.prisma.$queryRawUnsafe(
          `INSERT INTO "PriceSync" VALUES ('${id}', 0) RETURNING *`,
        ),
    ],
    [
      "a batch of one",
      (id) =>
        persistence.prisma.$transaction([
          persistence.prisma.priceSync.upsert(check(id)),
        ]),
    ],
  ])("refuses %s and writes nothing", async (name, write) => {
    await expect(write(`refused-${name}`)).rejects.toThrow(REFUSED);
    expect(await stored(`refused-${name}`)).toBe(0);
  });

  it.each(["updateMany", "deleteMany"] as const)(
    "refuses %s",
    async (method) => {
      const { priceSync } = persistence.prisma;
      await expect(
        method === "updateMany"
          ? priceSync.updateMany({ data: { checkedAt: NOW } })
          : priceSync.deleteMany(),
      ).rejects.toThrow(REFUSED);
    },
  );

  it.each<[string, (id: string) => Promise<unknown>]>([
    [
      "an interactive transaction",
      (id) =>
        persistence.prisma.$transaction((tx) => tx.priceSync.upsert(check(id))),
    ],
    [
      "raw SQL inside one",
      (id) =>
        persistence.prisma.$transaction((tx) =>
          tx.$executeRawUnsafe(`INSERT INTO "PriceSync" VALUES ('${id}', 0)`),
        ),
    ],
    [
      "a batch of two",
      (id) =>
        persistence.prisma.$transaction([
          persistence.prisma.priceSync.upsert(check(id)),
          persistence.prisma.priceSync.upsert(check(`${id}-second`)),
        ]),
    ],
  ])("lets through %s", async (name, write) => {
    await write(`allowed-${name}`);
    expect(await stored(`allowed-${name}`)).toBe(1);
  });

  it("lets through a plan version, whose nested create opens its own transaction", async () => {
    const repo = new persistence.PrismaTargetRepository();
    await repo.create({
      id: "v1",
      name: "plan",
      activeFrom: "2026-01-05",
      note: null,
      createdAt: NOW,
      lines: [{ instrumentId: "XS00TEST0001", monthlyAmount: "100" }],
    });
    expect((await repo.list()).map((target) => target.id)).toEqual(["v1"]);
  });

  it("lets reads through, raw ones included", async () => {
    const { prisma } = persistence;
    await expect(prisma.priceSync.findMany()).resolves.toBeInstanceOf(Array);
    await expect(prisma.priceSync.count()).resolves.toBeTypeOf("number");
    await expect(
      prisma.priceSnapshot.groupBy({ by: ["instrumentId"] }),
    ).resolves.toEqual([]);
    await expect(prisma.$queryRawUnsafe("SELECT 1")).resolves.toHaveLength(1);
    await expect(
      prisma.$queryRawUnsafe(`PRAGMA table_info("PriceSync")`),
    ).resolves.toHaveLength(2);
  });

  it("waits behind a transaction longer than Prisma's default 2 s maxWait", async () => {
    let opened = () => {};
    const isOpen = new Promise<void>((resolve) => {
      opened = resolve;
    });
    const holder = persistence.prisma.$transaction(async (tx) => {
      await tx.priceSync.upsert(check("holder"));
      opened();
      await sleep(2_500);
    });
    await isOpen;

    await new persistence.PrismaPriceSyncRepository().markChecked("waiter");
    await holder;

    expect(await stored("waiter")).toBe(1);
  });
});
