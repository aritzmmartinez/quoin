import "dotenv/config";

import { argv, exit } from "node:process";

import { YahooMarketDataProvider } from "~/adapters/marketdata";
import {
  PrismaInstrumentRepository,
  PrismaPriceRepository,
  prisma,
} from "~/adapters/persistence";
import { isCoarseSeries } from "~/lib/coarse-candles";
import { replaceQuoteHistories } from "~/lib/price-history";
import { rangeSince } from "~/lib/prices-backfill";

async function main(): Promise<void> {
  const only = argv.slice(2).find((arg) => !arg.startsWith("-"));

  const instruments = new PrismaInstrumentRepository();
  const prices = new PrismaPriceRepository();
  const [all, times] = await Promise.all([
    instruments.list(),
    prices.candleTimes(),
  ]);

  const now = new Date();
  const targets = all
    .filter((i) => i.quoteSymbol && (!only || i.id === only))
    .map((i) => ({
      instrumentId: i.id,
      name: i.name,
      symbol: i.quoteSymbol!,
      range: rangeSince(times.get(i.id)?.[0] ?? null, now),
      coarse: isCoarseSeries(times.get(i.id) ?? []),
    }));

  if (targets.length === 0) {
    console.log(
      only ? `${only} has no quote symbol.` : "No mapped instruments.",
    );
    return;
  }

  console.log(`Rebuilding ${targets.length} history(ies), one at a time.\n`);

  const outcomes = await replaceQuoteHistories(
    { instruments, prices, provider: new YahooMarketDataProvider() },
    targets,
    (outcome, index) => {
      const target = targets[index]!;
      const tag = `  ${target.instrumentId}  (${target.symbol}, ${target.range})${target.coarse ? " [coarse]" : ""}`;
      console.log(
        outcome.ok
          ? `${tag}  ${outcome.removed} → ${outcome.written}${outcome.live ? "" : "  no fresh quote"}`
          : `${tag}  FAILED: ${outcome.reason}${outcome.currency ? ` (${outcome.currency})` : ""}, nothing changed`,
      );
    },
  );

  const failed = outcomes.filter((o) => !o.ok);
  console.log(
    `\n${outcomes.length - failed.length} of ${outcomes.length} rebuilt.`,
  );
  if (failed.length > 0) {
    console.log("Failed:");
    for (const f of failed) console.log(`  ${f.instrumentId}  (${f.symbol})`);
    exit(1);
  }
}

main()
  .catch((error: unknown) => {
    console.error(
      "\nRebuild failed:",
      error instanceof Error ? error.message : error,
    );
    exit(1);
  })
  .finally(() => prisma.$disconnect());
