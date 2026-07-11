import "dotenv/config";

import { argv, exit } from "node:process";

import { PrismaInstrumentRepository, prisma } from "~/adapters/persistence";

const USAGE = `Usage:
  pnpm prices:map <ISIN>            show the current quote symbol
  pnpm prices:map <ISIN> <SYMBOL>   set the quote symbol (e.g. VWCE.DE, BTC-EUR)
  pnpm prices:map <ISIN> --clear    remove the quote symbol`;

async function main(): Promise<void> {
  const [id, symbolArg] = argv.slice(2);
  if (!id) {
    console.error(USAGE);
    exit(1);
  }

  const repo = new PrismaInstrumentRepository();
  const instrument = await repo.get(id);
  if (!instrument) {
    console.error(`No instrument found with id "${id}".`);
    exit(1);
  }

  if (symbolArg === undefined) {
    console.log(
      `${instrument.id}  ${instrument.name}\n  quoteSymbol: ${instrument.quoteSymbol ?? "(none)"}`,
    );
    return;
  }

  const symbol = symbolArg === "--clear" ? null : symbolArg;
  await repo.setQuoteSymbol(id, symbol);
  console.log(
    `${instrument.id}  ${instrument.name}\n  quoteSymbol: ${symbol ?? "(cleared)"}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      "\nMapping failed:",
      error instanceof Error ? error.message : error,
    );
    exit(1);
  })
  .finally(() => prisma.$disconnect());
