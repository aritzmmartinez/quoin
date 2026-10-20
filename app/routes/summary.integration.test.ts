import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Instrument, LedgerEvent } from "~/core/domain";

import type { Route } from "./+types/summary";

type Persistence = typeof import("~/adapters/persistence");
type SummaryRoute = typeof import("./summary");

let persistence: Persistence;
let route: SummaryRoute;

const tmpDir = "./.tmp-summary";
const dbPath = `${tmpDir}/it-${Date.now()}.sqlite`;

const PRICED = "XS00TEST0011";
const UNPRICED = "XS00TEST0012";

const instruments: Instrument[] = [
  {
    id: PRICED,
    name: "Synthetic Priced Fund",
    type: "ETF",
    thesis: "CORE",
  },
  {
    id: UNPRICED,
    name: "Synthetic Unpriced Fund",
    type: "ETF",
    thesis: "CORE",
  },
];

function buy(
  instrumentId: string,
  ts: string,
  quantity: string,
  grossAmount: string,
): LedgerEvent {
  return {
    id: crypto.randomUUID(),
    ts: new Date(ts),
    type: "BUY",
    instrumentId,
    quantity,
    price: "0",
    grossAmount,
    fees: "0",
    currency: "EUR",
    fxToBase: "1",
    account: "trade-republic",
    source: "TR_CSV",
    externalId: `${instrumentId}-${ts}`,
    note: null,
  };
}

// The unpriced buy comes first and dwarfs the priced one, so a loader that fed
// `events` instead of `included` into the flows would move `since`, break the
// TWR chain and drag the IRR negative.
const UNPRICED_BUY = buy(UNPRICED, "2025-12-01T10:00:00Z", "100", "10000");
const PRICED_BUY = buy(PRICED, "2026-01-01T10:00:00Z", "10", "1000");

async function load() {
  const result = await route.loader({
    request: new Request("http://localhost/?range=all"),
    params: {},
    context: {},
  } as unknown as Route.LoaderArgs);
  return result.data;
}

beforeAll(async () => {
  mkdirSync(tmpDir, { recursive: true });
  const dbUrl = `file:${dbPath}`;
  process.env.DATABASE_URL = dbUrl;
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: dbUrl },
  });

  persistence = await import("~/adapters/persistence");
  route = await import("./summary");

  await new persistence.PrismaInstrumentRepository().upsert(instruments);
  await new persistence.PrismaLedgerRepository().append([
    UNPRICED_BUY,
    PRICED_BUY,
  ]);
  await persistence.prisma.priceSnapshot.createMany({
    data: [
      ["2026-02-01T16:00:00Z", "105"],
      ["2026-04-01T16:00:00Z", "110"],
      ["2026-08-03T16:00:00Z", "120"],
    ].map(([asOf, price]) => ({
      instrumentId: PRICED,
      price: price!,
      currency: "EUR",
      asOf: new Date(asOf!),
      source: "YAHOO",
    })),
  });
});

afterAll(async () => {
  if (persistence) await persistence.prisma.$disconnect();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("summary loader with an open unpriced position", () => {
  it("reports the unpriced position without valuing it", async () => {
    const d = await load();

    expect(d.summary.unpricedCount).toBe(1);
    expect(d.summary.unpricedCost).toBe("10000");
    expect(d.summary.pricedCost).toBe("1000");
    expect(d.summary.openCost).toBe("11000");
    expect(d.summary.totalValue).toBe("1200");
    expect(d.totalContributed).toBe("11000");
  });

  it("draws the line over the priced position alone", async () => {
    const d = await load();

    expect(d.series[0]?.t).toBe(PRICED_BUY.ts.getTime());
    expect(d.series.every((p) => p.invested === 1000)).toBe(true);
    expect(d.series.at(-1)?.value).toBe(1200);
  });

  it("computes TWR and IRR over the priced position's flows alone", async () => {
    const d = await load();

    expect(d.returns.since).toBe(PRICED_BUY.ts.getTime());
    expect(d.returns.twr.cumulative).toBe("0.200000");
    expect(Number(d.returns.mwr.annual)).toBeGreaterThan(0);
  });
});
