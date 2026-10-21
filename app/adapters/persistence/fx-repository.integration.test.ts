import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { FxRate, FxSeries } from "~/core/ports";

let fxRepo: InstanceType<typeof import("./fx-repository").PrismaFxRepository>;
let disconnect: () => Promise<void>;

const tmpDir = "./.tmp-fx";
const dbPath = `${tmpDir}/it-${Date.now()}.sqlite`;

const USD: FxSeries = { source: "ECB", base: "EUR", quote: "USD" };
const GBP: FxSeries = { source: "ECB", base: "EUR", quote: "GBP" };

const rate = (series: FxSeries, day: string, value: string): FxRate => ({
  ...series,
  day,
  rate: value,
});

beforeAll(async () => {
  mkdirSync(tmpDir, { recursive: true });
  const dbUrl = `file:${dbPath}`;
  process.env.DATABASE_URL = dbUrl;
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: dbUrl },
  });

  const persistence = await import("./index");
  fxRepo = new persistence.PrismaFxRepository();
  disconnect = () => persistence.prisma.$disconnect();
});

afterAll(async () => {
  if (disconnect) await disconnect();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("PrismaFxRepository (integration)", () => {
  it("stores rates and reads them back per series, oldest first", async () => {
    const result = await fxRepo.save(USD, [
      rate(USD, "2026-04-07", "1.0900"),
      rate(USD, "2026-04-02", "1.0850"),
    ]);
    await fxRepo.save(GBP, [rate(GBP, "2026-04-02", "0.8400")]);

    expect(result).toEqual({ inserted: 2, unchanged: 0, conflicts: [] });
    expect(await fxRepo.list(USD)).toEqual([
      rate(USD, "2026-04-02", "1.0850"),
      rate(USD, "2026-04-07", "1.0900"),
    ]);
    expect(await fxRepo.firstDay(USD)).toBe("2026-04-02");
    expect(await fxRepo.lastDay(USD)).toBe("2026-04-07");
    expect(await fxRepo.lastDay(GBP)).toBe("2026-04-02");
  });

  it("is idempotent: the same rates again change nothing", async () => {
    const result = await fxRepo.save(USD, [rate(USD, "2026-04-07", "1.09")]);

    expect(result).toEqual({ inserted: 0, unchanged: 1, conflicts: [] });
    expect(await fxRepo.list(USD)).toHaveLength(2);
  });

  it("refuses a revised rate and writes nothing from that batch", async () => {
    const result = await fxRepo.save(USD, [
      rate(USD, "2026-04-07", "1.0910"),
      rate(USD, "2026-04-08", "1.0920"),
    ]);

    expect(result.inserted).toBe(0);
    expect(result.conflicts).toEqual([
      {
        stored: rate(USD, "2026-04-07", "1.0900"),
        incoming: rate(USD, "2026-04-07", "1.0910"),
      },
    ]);
    expect(await fxRepo.list(USD)).toEqual([
      rate(USD, "2026-04-02", "1.0850"),
      rate(USD, "2026-04-07", "1.0900"),
    ]);
  });

  it("records each check separately from the rates", async () => {
    expect(await fxRepo.lastSyncedAt(USD)).toBeNull();

    await fxRepo.markChecked(USD);

    expect(await fxRepo.lastSyncedAt(USD)).toBeInstanceOf(Date);
    expect(await fxRepo.lastSyncedAt(GBP)).toBeNull();
  });

  it("reads a rate book for the currencies asked, sorted by day", async () => {
    const other: FxSeries = { source: "TEST", base: "EUR", quote: "USD" };
    await fxRepo.save(other, [rate(other, "2026-04-03", "9")]);

    const book = await fxRepo.book("ECB", ["USD", "JPY"]);

    expect(book.get("USD")?.map((r) => [r.day, r.rate])).toEqual([
      ["2026-04-02", "1.0850"],
      ["2026-04-07", "1.0900"],
    ]);
    expect(book.has("GBP")).toBe(false);
    expect(book.has("JPY")).toBe(false);
  });

  it("reads an empty book when asked for no currency", async () => {
    expect((await fxRepo.book("ECB", [])).size).toBe(0);
  });
});
