import "dotenv/config";

import { argv, exit } from "node:process";

import { YahooMarketDataProvider } from "~/adapters/marketdata";
import {
  PrismaInstrumentRepository,
  PrismaPriceRepository,
  prisma,
} from "~/adapters/persistence";
import type { HistoryRange, PriceSnapshot } from "~/core/ports";

const RANGES: readonly HistoryRange[] = ["1y", "2y", "5y", "10y", "max"];
const DEFAULT_RANGE: HistoryRange = "5y";

function isRange(value: string): value is HistoryRange {
  return (RANGES as readonly string[]).includes(value);
}

function usage(): string {
  return [
    "Usage: pnpm prices:backfill [ISIN] [range]",
    "",
    `  ISIN   backfill a single instrument (default: every mapped instrument)`,
    `  range  one of ${RANGES.join(", ")} (default: ${DEFAULT_RANGE})`,
  ].join("\n");
}

async function main(): Promise<void> {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }

  const rangeArg = args.find((arg) => isRange(arg));
  const range: HistoryRange = rangeArg ?? DEFAULT_RANGE;
  const isinArg = args.find((arg) => arg !== rangeArg);

  const instruments = await new PrismaInstrumentRepository().list();
  const mapped = instruments.filter(
    (i): i is typeof i & { quoteSymbol: string } => Boolean(i.quoteSymbol),
  );

  const targets = isinArg ? mapped.filter((i) => i.id === isinArg) : mapped;

  if (isinArg && targets.length === 0) {
    const known = instruments.find((i) => i.id === isinArg);
    console.error(
      known
        ? `\n${isinArg} has no quote symbol. Set one with \`pnpm prices:map ${isinArg} <SYMBOL>\`.`
        : `\nNo instrument with id ${isinArg}.`,
    );
    exit(1);
  }
  if (targets.length === 0) {
    console.log("No mapped instruments to backfill.");
    return;
  }

  console.log(`Backfilling ${targets.length} instrument(s), range ${range}.\n`);

  const provider = new YahooMarketDataProvider();
  const repository = new PrismaPriceRepository();
  let total = 0;

  for (const instrument of targets) {
    const quotes = await provider.getHistory(instrument.quoteSymbol, range);

    if (quotes.length === 0) {
      console.log(
        `  ${instrument.id}  (${instrument.quoteSymbol})  no history returned`,
      );
      continue;
    }

    const snapshots: PriceSnapshot[] = quotes.map((quote) => ({
      instrumentId: instrument.id,
      price: quote.price,
      currency: quote.currency,
      asOf: quote.asOf,
      source: provider.source,
    }));

    const written = await repository.saveMany(snapshots);
    total += written;

    const first = quotes[0]?.asOf.toISOString().slice(0, 10);
    const last = quotes[quotes.length - 1]?.asOf.toISOString().slice(0, 10);
    console.log(
      `  ${instrument.id}  (${instrument.quoteSymbol})  ${written} candle(s)  ${first} → ${last}  ${quotes[0]?.currency}`,
    );
  }

  console.log(`\nPersisted ${total} snapshot(s).`);
}

main()
  .catch((error: unknown) => {
    console.error(
      "\nPrice backfill failed:",
      error instanceof Error ? error.message : error,
    );
    exit(1);
  })
  .finally(() => prisma.$disconnect());
