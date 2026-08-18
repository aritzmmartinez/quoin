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
  type ImportSummary,
} from "~/adapters/ingestion";
import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
  prisma,
} from "~/adapters/persistence";

const BROKERS = ["trade-republic", "kraken"] as const;

type Broker = (typeof BROKERS)[number];

const USAGE = `Usage: pnpm ingest --broker=<${BROKERS.join("|")}> <file.csv> [--yes]`;

function printSummary(title: string, summary: ImportSummary): void {
  const discarded = Object.entries(summary.discarded)
    .map(([reason, count]) => `${reason}: ${count}`)
    .join(", ");
  console.log(`\n${title}`);
  console.log(`  total transactions : ${summary.total}`);
  console.log(`  to import (new)    : ${summary.imported}`);
  console.log(`  duplicates (skip)  : ${summary.duplicates}`);
  console.log(`  discarded          : ${discarded || "none"}`);
  console.log(`  errors             : ${summary.errors}`);
  console.log(`  instruments        : ${summary.instruments}`);
}

async function confirm(): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(
    "\nProceed and write to the database? (y/N) ",
  );
  rl.close();
  return answer.trim().toLowerCase() === "y";
}

async function main(): Promise<void> {
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
  const adapter =
    broker === "kraken"
      ? new KrakenCsvAdapter(instruments, ledger, new PrismaPriceRepository())
      : new TradeRepublicCsvAdapter(instruments, ledger);

  const csv = readFileSync(resolve(file), "utf8");

  const batch = await adapter.plan(csv);
  const preview = await previewBatch(ledger, batch);
  printSummary(`Preview (${broker})`, preview);

  if (preview.imported === 0) {
    console.log("\nNothing new to import.");
    return;
  }

  if (!values.yes && !(await confirm())) {
    console.log("Aborted. Nothing written.");
    return;
  }

  const result = await persistBatch(instruments, ledger, batch);
  printSummary("Imported", result);
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
