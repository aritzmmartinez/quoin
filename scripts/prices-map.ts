import "dotenv/config";

import { argv, exit } from "node:process";

import { YahooMarketDataProvider } from "~/adapters/marketdata";
import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
  prisma,
} from "~/adapters/persistence";
import { computePositions } from "~/core/projections";
import { remapQuoteSymbol } from "~/lib/quote-symbol";
import { checkSymbol, heldQuantity } from "~/lib/symbol-check";

const USAGE = `Usage:
  pnpm prices:map <ISIN>            show the current quote symbol
  pnpm prices:map <ISIN> <SYMBOL>   set the quote symbol (e.g. VWCE.DE, BTC-EUR)
  pnpm prices:map <ISIN> --clear    remove the quote symbol`;

async function preview(symbol: string, instrumentId: string): Promise<void> {
  try {
    const [quote] = await new YahooMarketDataProvider().getQuotes([symbol]);
    if (!quote) {
      console.log(
        `  ⚠ no quote returned for ${symbol} — try another venue (.MI, .PA, .F).`,
      );
      return;
    }

    const events = await new PrismaLedgerRepository().list();
    const check = checkSymbol(
      quote,
      heldQuantity(computePositions(events), instrumentId),
    );

    const stale = check.fresh
      ? ""
      : "  ⚠ STALE timestamp — likely the wrong/illiquid venue";
    console.log(`  → ${check.price} ${check.currency} @ ${check.asOf}${stale}`);
    console.log(
      `  → implied value: ${check.quantity} units = ${check.impliedValue} ${check.currency}`,
    );
    if (check.closed) {
      console.log(
        "  ⚠ position is closed (0 units held) — a zero implied value can't sanity-check this symbol against what you paid, so verify the venue by hand.",
      );
    }
  } catch {
    console.log("  (could not fetch a preview price — check your connection)");
  }
}

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

  const { removed } = await remapQuoteSymbol(
    repo,
    new PrismaPriceRepository(),
    id,
    symbol,
  );
  if (removed > 0) console.log(`Cleared ${removed} old price snapshot(s).`);

  console.log(
    `${instrument.id}  ${instrument.name}\n  quoteSymbol: ${symbol ?? "(cleared)"}`,
  );

  if (symbol) await preview(symbol, id);
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
