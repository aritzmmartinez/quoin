import "dotenv/config";

import { argv, exit } from "node:process";

import { YahooMarketDataProvider } from "~/adapters/marketdata";
import {
  PrismaInstrumentRepository,
  PrismaPriceRepository,
  prisma,
} from "~/adapters/persistence";
import type { HistoryRange } from "~/core/ports";
import {
  DEFAULT_HISTORY_RANGE,
  HISTORY_RANGES,
  backfillInstrument,
  isHistoryRange,
} from "~/lib/prices-backfill";

import { ensureRatesNow } from "~/lib/fx-sync.server";

import { announceDatabase } from "./lib/db-target";
import { loadResidence } from "~/lib/residence.server";

function usage(): string {
  return [
    "Usage: pnpm prices:backfill [ISIN] [range]",
    "",
    `  ISIN   backfill a single instrument (default: every mapped instrument)`,
    `  range  one of ${HISTORY_RANGES.join(", ")} (default: ${DEFAULT_HISTORY_RANGE})`,
  ].join("\n");
}

async function main(): Promise<void> {
  announceDatabase();
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }

  const rangeArg = args.find((arg) => isHistoryRange(arg));
  const range: HistoryRange = rangeArg ?? DEFAULT_HISTORY_RANGE;
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
  const { calendarZone } = await loadResidence();
  let total = 0;

  for (const instrument of targets) {
    const report = await backfillInstrument(
      provider,
      repository,
      { id: instrument.id, quoteSymbol: instrument.quoteSymbol },
      range,
      ensureRatesNow,
      calendarZone,
    );
    total += report.written;

    if (report.ratesUnavailable) {
      console.log(
        `  ${report.instrumentId}  (${report.symbol})  history in ${report.ratesUnavailable}, not stored: the ECB could not be reached for its rates`,
      );
      continue;
    }
    if (report.noRateSeries) {
      console.log(
        `  ${report.instrumentId}  (${report.symbol})  history in ${report.noRateSeries}, not stored: the ECB publishes no rates for it`,
      );
      continue;
    }
    if (report.written === 0 && report.first === null) {
      console.log(
        `  ${report.instrumentId}  (${report.symbol})  no history returned`,
      );
      continue;
    }

    const weekly = report.weekly
      ? "  ⚠ Yahoo returned weekly candles for this symbol; run prices:rebuild later or check the symbol"
      : "";
    console.log(
      `  ${report.instrumentId}  (${report.symbol})  ${report.written} candle(s)  ${report.first?.slice(0, 10)} → ${report.last?.slice(0, 10)}  ${report.currency}${weekly}`,
    );
  }

  console.log(`\nPersisted ${total} snapshot(s).`);
  console.log(
    "Run `pnpm prices:sync` next: the most recent session comes back without a close and is not in this history.",
  );
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
