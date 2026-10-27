import "dotenv/config";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stdin, stdout, argv, exit } from "node:process";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

import {
  KrakenCsvAdapter,
  TradeRepublicCsvAdapter,
  persistBatch,
  previewBatch,
  BROKERS,
  type Broker,
  type ImportSummary,
} from "~/adapters/ingestion";
import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
  prisma,
} from "~/adapters/persistence";
import {
  copyFor,
  discardGroups,
  earliestUnpriced,
  mergeRetry,
  noticeGroups,
  rangeSince,
  unpricedAssetIds,
  unpricedEntries,
} from "~/lib";
import { ensureRatesNow } from "~/lib/fx-sync.server";
import { planWithRates } from "~/lib/ingest-rates";
import { fillPrices } from "~/lib/ingest.server";
import { loadRateBook } from "~/lib/rate-book.server";

import { announceDatabase } from "./lib/db-target";
import { loadResidence } from "~/lib/residence.server";

const USAGE = `Usage: pnpm ingest --broker=<${BROKERS.join("|")}> <file.csv> [--yes]`;

const copy = copyFor("en").ingest.summary;

function printSummary(title: string, summary: ImportSummary): void {
  const groups = discardGroups(summary);
  const discarded = groups.reduce((sum, group) => sum + group.count, 0);
  console.log(`\n${title}`);
  console.log(`  total transactions : ${summary.total}`);
  console.log(`  to import (new)    : ${summary.imported}`);
  console.log(`  duplicates (skip)  : ${summary.duplicates}`);
  console.log(`  discarded          : ${discarded || "none"}`);
  for (const group of groups) {
    const flag = group.affectsPosition ? "  ! " : "    ";
    console.log(`${flag}  ${copy.reasons[group.reason]}: ${group.count}`);
    if (group.byInstrument.length > 0) {
      const assets = group.byInstrument
        .map(
          ({ instrument, count }) =>
            `${instrument ?? copy.noInstrument} ${count}`,
        )
        .join(", ");
      console.log(`        ${assets}`);
    }
    const help = copy.reasonHelp[group.reason];
    if (help) console.log(`        ${help}`);
  }
  if (
    groups.some(
      (group) => group.affectsPosition && !copy.reasonHelp[group.reason],
    )
  ) {
    console.log(`  ! ${copy.positionWarning}`);
  }
  for (const { reason, details } of noticeGroups(summary)) {
    console.log(`  ${copy.notices[reason]}: ${details.length}`);
    console.log(`        ${copy.noticeHelp[reason]}`);
  }
  console.log(`  errors             : ${summary.errors}`);
  console.log(`  instruments        : ${summary.instruments}`);
}

async function ask(question: string): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`\n${question} (y/N) `);
  rl.close();
  return answer.trim().toLowerCase() === "y";
}

async function retryUnpriced(
  adapter: KrakenCsvAdapter | TradeRepublicCsvAdapter,
  instruments: PrismaInstrumentRepository,
  ledger: PrismaLedgerRepository,
  csv: string,
  first: ImportSummary,
  yes: boolean,
): Promise<void> {
  const unpriced = unpricedEntries(first);
  const earliest = earliestUnpriced(first);
  if (unpriced === 0 || earliest === null) return;

  const ids = unpricedAssetIds(first);
  const stored = await instruments.list();
  const unmapped = ids.filter(
    (id) => !stored.find((instrument) => instrument.id === id)?.quoteSymbol,
  );
  if (unmapped.length > 0) {
    console.log(
      `\n${unpriced} reward(s) or swap(s) could not be valued. Map ${unmapped.join(", ")} first ` +
        "(pnpm prices:map <ID> <SYMBOL>), then run this import again.",
    );
    return;
  }

  const range = rangeSince(earliest, new Date());
  const question = `${unpriced} reward(s) or swap(s) have no price yet. Backfill ${ids.join(", ")} (${range}) and re-import?`;
  if (!yes && !(await ask(question))) return;

  const fill = await fillPrices(ids, range);
  console.log(`\n  candles written    : ${fill.candles}`);
  if (fill.noRateSeries > 0) {
    console.log(
      `  no ECB rates       : ${fill.noRateSeries} (history refused: the ECB publishes no rates for its currency)`,
    );
  }
  if (fill.ratesUnavailable.length > 0) {
    console.log(
      `  ECB unreachable    : ${fill.ratesUnavailable.join(", ")} (history not downloaded; try again later)`,
    );
  }
  const retried = await persistBatch(
    instruments,
    ledger,
    await planWithRates(() => adapter.plan(csv), ensureRatesNow),
  );
  const merged = mergeRetry(first, retried);
  console.log(`  recovered          : ${merged.recovered}`);
  printSummary("After re-import", merged.summary);
}

async function main(): Promise<void> {
  announceDatabase();
  const { values, positionals } = parseArgs({
    args: argv.slice(2),
    options: {
      broker: { type: "string" },
      yes: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const broker = values.broker;
  const file = positionals[0];

  if (!broker || !BROKERS.includes(broker as Broker) || !file) {
    console.error(USAGE);
    exit(1);
  }

  const instruments = new PrismaInstrumentRepository();
  const ledger = new PrismaLedgerRepository();
  const { calendarZone } = await loadResidence();
  const adapter =
    broker === "kraken"
      ? new KrakenCsvAdapter(
          instruments,
          ledger,
          calendarZone,
          new PrismaPriceRepository(),
          loadRateBook,
        )
      : new TradeRepublicCsvAdapter(
          instruments,
          ledger,
          calendarZone,
          loadRateBook,
        );

  const csv = readFileSync(resolve(file), "utf8");

  const batch = await planWithRates(() => adapter.plan(csv), ensureRatesNow);
  const preview = await previewBatch(ledger, batch);
  printSummary(`Preview (${broker})`, preview);

  if (preview.imported === 0 && unpricedEntries(preview) === 0) {
    console.log("\nNothing new to import.");
    return;
  }

  if (!values.yes && !(await ask("Proceed and write to the database?"))) {
    console.log("Aborted. Nothing written.");
    return;
  }

  const result = await persistBatch(instruments, ledger, batch);
  printSummary("Imported", result);
  await retryUnpriced(adapter, instruments, ledger, csv, result, values.yes);
}

main()
  .catch((error: unknown) => {
    console.error(
      "\nImport failed:",
      error instanceof Error ? error.message : error,
    );
    exit(1);
  })
  .finally(() => prisma.$disconnect());
