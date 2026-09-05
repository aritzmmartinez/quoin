import "dotenv/config";

import { exit } from "node:process";

import { prisma } from "~/adapters/persistence";
import { syncPrices } from "~/lib/prices-sync.server";

async function main(): Promise<void> {
  const result = await syncPrices();

  const total = result.mapped + result.unmapped.length;
  console.log(
    `Instruments: ${total} | mapped: ${result.mapped} | unmapped: ${result.unmapped.length}`,
  );

  if (result.unmapped.length > 0) {
    console.log(
      "\nNo quote symbol yet (set one with `pnpm prices:map <ISIN> <SYMBOL>`):",
    );
    for (const i of result.unmapped) {
      console.log(`  ${i.instrumentId}  ${i.name}`);
    }
  }
  if (result.mapped === 0) {
    console.log("\nNothing to sync.");
    return;
  }

  console.log(`\nPersisted ${result.updated} fresh quote(s):`);
  for (const s of result.snapshots) {
    console.log(
      `  ${s.instrumentId}  ${s.price} ${s.currency}  @ ${s.asOf.toISOString()}`,
    );
  }

  const stale = result.failures.filter((f) => f.reason === "stale");
  if (stale.length > 0) {
    console.log(
      "\nStale quotes skipped (provider returned an old timestamp — try another venue):",
    );
    for (const f of stale) {
      console.log(
        `  ${f.instrumentId}  (${f.symbol})  last @ ${f.asOf?.toISOString() ?? "?"}`,
      );
    }
  }

  const noQuote = result.failures.filter((f) => f.reason === "no-quote");
  if (noQuote.length > 0) {
    console.log(
      "\nNo quote returned for (check the symbol on finance.yahoo.com):",
    );
    for (const f of noQuote) console.log(`  ${f.instrumentId}  (${f.symbol})`);
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
