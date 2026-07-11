import "dotenv/config";

import { exit } from "node:process";

import { YahooMarketDataProvider, YAHOO_SYMBOLS } from "~/adapters/marketdata";
import {
  PrismaInstrumentRepository,
  PrismaPriceRepository,
  prisma,
} from "~/adapters/persistence";
import type { PriceSnapshot } from "~/core/ports";

async function main(): Promise<void> {
  const instruments = await new PrismaInstrumentRepository().list();

  const mapped = instruments
    .map((instrument) => ({ instrument, symbol: YAHOO_SYMBOLS[instrument.id] }))
    .filter(
      (m): m is { instrument: (typeof instruments)[number]; symbol: string } =>
        Boolean(m.symbol),
    );
  const unmapped = instruments.filter((i) => !YAHOO_SYMBOLS[i.id]);
  const symbolToId = new Map(mapped.map((m) => [m.symbol, m.instrument.id]));

  console.log(
    `Instruments: ${instruments.length} | mapped: ${mapped.length} | unmapped: ${unmapped.length}`,
  );
  if (unmapped.length > 0) {
    console.log("\nUnmapped (add them to YAHOO_SYMBOLS to include):");
    for (const i of unmapped) console.log(`  ${i.id}  ${i.name}`);
  }
  if (mapped.length === 0) {
    console.log("\nNothing to sync.");
    return;
  }

  const provider = new YahooMarketDataProvider();
  const quotes = await provider.getQuotes(mapped.map((m) => m.symbol));

  const seen = new Set<string>();
  const snapshots: PriceSnapshot[] = [];
  for (const q of quotes) {
    const instrumentId = symbolToId.get(q.symbol);
    if (!instrumentId) continue;
    seen.add(q.symbol);
    snapshots.push({
      instrumentId,
      price: q.price,
      currency: q.currency,
      asOf: q.asOf,
      source: provider.source,
    });
  }
  const failed = mapped.filter((m) => !seen.has(m.symbol));

  const written = await new PrismaPriceRepository().saveMany(snapshots);

  console.log(`\nFetched ${quotes.length} quote(s), persisted ${written}:`);
  for (const s of snapshots) {
    console.log(
      `  ${s.instrumentId}  ${s.price} ${s.currency}  @ ${s.asOf.toISOString()}`,
    );
  }
  if (failed.length > 0) {
    console.log("\nNo quote returned for (check the symbol on finance.yahoo.com):");
    for (const m of failed) console.log(`  ${m.instrument.id}  (${m.symbol})`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(
      "\nPrice sync failed:",
      error instanceof Error ? error.message : error,
    );
    exit(1);
  })
  .finally(() => prisma.$disconnect());
