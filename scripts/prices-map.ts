import "dotenv/config";

import { argv, exit } from "node:process";

import Decimal from "decimal.js";

import { isFreshQuote, YahooMarketDataProvider } from "~/adapters/marketdata";
import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
  prisma,
} from "~/adapters/persistence";
import { computePositions } from "~/core/projections";

const USAGE = `Usage:
  pnpm prices:map <ISIN>            show the current quote symbol
  pnpm prices:map <ISIN> <SYMBOL>   set the quote symbol (e.g. VWCE.DE, BTC-EUR)
  pnpm prices:map <ISIN> --clear    remove the quote symbol`;

async function heldQuantity(instrumentId: string): Promise<Decimal> {
  const events = await new PrismaLedgerRepository().list();
  return computePositions(events)
    .filter((p) => p.instrumentId === instrumentId)
    .reduce((sum, p) => sum.plus(new Decimal(p.quantity)), new Decimal(0));
}

async function preview(symbol: string, instrumentId: string): Promise<void> {
  try {
    const [quote] = await new YahooMarketDataProvider().getQuotes([symbol]);
    if (!quote) {
      console.log(
        `  ⚠ no quote returned for ${symbol} — try another venue (.MI, .PA, .F).`,
      );
      return;
    }
    const qty = await heldQuantity(instrumentId);
    const implied = new Decimal(quote.price).mul(qty).toFixed(2);
    const stale = isFreshQuote(quote)
      ? ""
      : "  ⚠ STALE timestamp — likely the wrong/illiquid venue";
    console.log(
      `  → ${quote.price} ${quote.currency} @ ${quote.asOf.toISOString()}${stale}`,
    );
    console.log(
      `  → implied value: ${qty.toFixed(qty.isInteger() ? 0 : 4)} units = ${implied} ${quote.currency}`,
    );
    if (qty.isZero()) {
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

  if (symbol !== instrument.quoteSymbol) {
    const removed = await new PrismaPriceRepository().deleteForInstrument(id);
    if (removed > 0) console.log(`Cleared ${removed} old price snapshot(s).`);
  }

  await repo.setQuoteSymbol(id, symbol);
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
