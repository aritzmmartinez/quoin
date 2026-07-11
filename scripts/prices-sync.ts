import "dotenv/config";

import { exit } from "node:process";

import { YahooMarketDataProvider } from "~/adapters/marketdata";
import {
  PrismaInstrumentRepository,
  PrismaPriceRepository,
  prisma,
} from "~/adapters/persistence";
import type { PriceSnapshot } from "~/core/ports";

async function main(): Promise<void> {
  const instruments = await new PrismaInstrumentRepository().list();

  const mapped = instruments.filter(
    (i): i is typeof i & { quoteSymbol: string } => Boolean(i.quoteSymbol),
  );
  const unmapped = instruments.filter((i) => !i.quoteSymbol);
  const symbolToId = new Map(mapped.map((i) => [i.quoteSymbol, i.id]));

  console.log(
    `Instruments: ${instruments.length} | mapped: ${mapped.length} | unmapped: ${unmapped.length}`,
  );
  if (unmapped.length > 0) {
    console.log(
      "\nNo quote symbol yet (set one with `pnpm prices:map <ISIN> <SYMBOL>`):",
    );
    for (const i of unmapped) console.log(`  ${i.id}  ${i.name}`);
  }
  if (mapped.length === 0) {
    console.log("\nNothing to sync.");
    return;
  }

  const provider = new YahooMarketDataProvider();
  const quotes = await provider.getQuotes(mapped.map((i) => i.quoteSymbol));

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
  const failed = mapped.filter((i) => !seen.has(i.quoteSymbol));

  const written = await new PrismaPriceRepository().saveMany(snapshots);

  console.log(`\nFetched ${quotes.length} quote(s), persisted ${written}:`);
  for (const s of snapshots) {
    console.log(
      `  ${s.instrumentId}  ${s.price} ${s.currency}  @ ${s.asOf.toISOString()}`,
    );
  }
  if (failed.length > 0) {
    console.log(
      "\nNo quote returned for (check the symbol on finance.yahoo.com):",
    );
    for (const i of failed) console.log(`  ${i.id}  (${i.quoteSymbol})`);
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
