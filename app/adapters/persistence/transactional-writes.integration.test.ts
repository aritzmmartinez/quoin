import { mkdirSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migratedDatabase } from "../../../test/integration/template";

import { isInKind, type Instrument, type LedgerEvent } from "~/core/domain";

type Persistence = typeof import("./index");

let persistence: Persistence;

const tmpDir = "./.tmp-transactional-writes";
const dbPath = `${tmpDir}/it-${Date.now()}.sqlite`;

const FX_SERIES = { source: "ECB", base: "EUR", quote: "USD" };
const AS_OF = new Date("2026-01-05T00:00:00.000Z");

const instrument = (id: string): Instrument => ({
  id,
  name: "Synthetic Fund",
  type: "ETF",
  assetClass: "FUND",
  thesis: "CORE",
});

const event = (
  externalId: string,
  funding: "CASH" | "IN_KIND" = "CASH",
): LedgerEvent => ({
  id: crypto.randomUUID(),
  ts: new Date("2026-01-02T00:00:00.000Z"),
  type: "BUY",
  instrumentId: "XS00TEST0001",
  quantity: "1",
  price: "100",
  grossAmount: "100",
  fees: "0",
  currency: "EUR",
  funding,
  account: "test",
  source: "TEST_CSV",
  externalId,
  note: null,
});

function failingPriceWrite() {
  let fail = () => {};
  const gate = new Promise<void>((resolve) => {
    fail = resolve;
  });
  let opened = () => {};
  const isOpen = new Promise<void>((resolve) => {
    opened = resolve;
  });
  const done = persistence.prisma
    .$transaction(async (tx) => {
      await tx.priceSnapshot.create({
        data: {
          instrumentId: "XS00TEST0001",
          price: "1",
          currency: "EUR",
          asOf: AS_OF,
          source: "YAHOO",
        },
      });
      opened();
      await gate;
      throw new Error("the price write failed");
    })
    .catch((error: unknown) => error);
  return { isOpen, fail, done };
}

async function whileARollbackIsPending(write: () => Promise<unknown>) {
  const prices = failingPriceWrite();
  await prices.isOpen;
  let settled = false;
  const writing = write().finally(() => {
    settled = true;
  });
  await sleep(100);
  const settledWhileOpen = settled;
  prices.fail();
  expect(await prices.done).toMatchObject({
    message: "the price write failed",
  });
  await writing;
  return settledWhileOpen;
}

beforeAll(async () => {
  mkdirSync(tmpDir, { recursive: true });
  process.env.DATABASE_URL = `file:${dbPath}`;
  migratedDatabase(dbPath);
  persistence = await import("./index");
  await new persistence.PrismaInstrumentRepository().upsert([
    instrument("XS00TEST0001"),
  ]);
});

afterAll(async () => {
  await persistence.prisma.$disconnect();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("a write while another transaction is open (integration)", () => {
  it("keeps an import when the price refresh it ran beside rolls back", async () => {
    const instruments = new persistence.PrismaInstrumentRepository();
    const ledger = new persistence.PrismaLedgerRepository();
    await ledger.append([event("reward-1")]);

    const settledWhileOpen = await whileARollbackIsPending(async () => {
      await instruments.upsert([instrument("XS00TEST0002")]);
      await ledger.append([event("buy-1"), event("buy-2")]);
      await ledger.markInKind([event("reward-1", "IN_KIND")]);
    });

    expect(await instruments.get("XS00TEST0002")).not.toBeNull();
    const stored = await ledger.list();
    expect(stored.map((e) => e.externalId).sort()).toEqual([
      "buy-1",
      "buy-2",
      "reward-1",
    ]);
    expect(isInKind(stored.find((e) => e.externalId === "reward-1")!)).toBe(
      true,
    );
    expect(
      await new persistence.PrismaPriceRepository().lastAsOf("XS00TEST0001"),
    ).toBeNull();
    expect(settledWhileOpen).toBe(false);
  });

  it.each<{
    name: string;
    before?: () => Promise<unknown>;
    write: () => Promise<unknown>;
    survived: () => Promise<boolean>;
  }>([
    {
      name: "a price check",
      write: () =>
        new persistence.PrismaPriceSyncRepository().markChecked("XS00TEST0003"),
      survived: async () =>
        (await new persistence.PrismaPriceSyncRepository().lastChecked()).has(
          "XS00TEST0003",
        ),
    },
    {
      name: "a rate check",
      write: () => new persistence.PrismaFxRepository().markChecked(FX_SERIES),
      survived: async () =>
        (await new persistence.PrismaFxRepository().lastSyncedAt(FX_SERIES)) !==
        null,
    },
    {
      name: "an inflation check",
      write: () =>
        new persistence.PrismaInflationRepository().markChecked("ES"),
      survived: async () =>
        (await new persistence.PrismaInflationRepository().lastSyncedAt(
          "ES",
        )) !== null,
    },
    {
      name: "one inflation point",
      write: () =>
        new persistence.PrismaInflationRepository().saveMany([
          {
            series: "BI",
            period: "2026-01",
            indexValue: "100",
            base: "2025",
            source: "INE",
          },
        ]),
      survived: async () =>
        (await new persistence.PrismaInflationRepository().list("BI"))
          .length === 1,
    },
    {
      name: "deleting an inflation series",
      before: () =>
        new persistence.PrismaInflationRepository().saveMany([
          {
            series: "OLD",
            period: "2026-01",
            indexValue: "100",
            base: "2025",
            source: "INE",
          },
        ]),
      write: () =>
        new persistence.PrismaInflationRepository().deleteSeries("OLD"),
      survived: async () =>
        (await new persistence.PrismaInflationRepository().list("OLD"))
          .length === 0,
    },
    {
      name: "one security identity",
      write: () =>
        new persistence.PrismaSecurityIdentityRepository().save([
          {
            value: "XS00TEST0004",
            kind: "ISIN",
            resolution: { status: "not-found" },
            source: "TEST",
          },
        ]),
      survived: async () =>
        (await new persistence.PrismaSecurityIdentityRepository().all()).has(
          "XS00TEST0004",
        ),
    },
    {
      name: "one price",
      before: () =>
        new persistence.PrismaInstrumentRepository().upsert([
          instrument("XS00TEST0005"),
        ]),
      write: () =>
        new persistence.PrismaPriceRepository().saveMany([
          {
            instrumentId: "XS00TEST0005",
            price: "1",
            currency: "EUR",
            asOf: AS_OF,
            source: "YAHOO",
          },
        ]),
      survived: async () =>
        (await new persistence.PrismaPriceRepository().lastAsOf(
          "XS00TEST0005",
        )) !== null,
    },
  ])("keeps $name", async ({ before, write, survived }) => {
    await before?.();
    const settledWhileOpen = await whileARollbackIsPending(write);
    expect(await survived()).toBe(true);
    expect(settledWhileOpen).toBe(false);
  });
});
