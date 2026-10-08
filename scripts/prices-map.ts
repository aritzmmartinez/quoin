import "dotenv/config";

import { argv, exit } from "node:process";

import Decimal from "decimal.js";

import { YahooMarketDataProvider } from "~/adapters/marketdata";
import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
  prisma,
} from "~/adapters/persistence";
import { replaceQuoteHistory } from "~/lib/price-history";
import { isHistoryRange, rangeSince } from "~/lib/prices-backfill";
import { clearQuoteSymbol } from "~/lib/quote-symbol";
import { checkQuoteAgainstLedger } from "~/lib/symbol-check";

const USAGE = `Usage:
  pnpm prices:map <ISIN>                    show the current quote symbol
  pnpm prices:map <ISIN> <SYMBOL> [range]   set the symbol and replace the history
                                            (e.g. VWCE.DE, BTC-EUR; range 1y|2y|5y|10y|max)
  pnpm prices:map <ISIN> --clear            remove the quote symbol and its prices`;

async function preview(symbol: string, instrumentId: string): Promise<void> {
  try {
    const check = await checkQuoteAgainstLedger(
      new YahooMarketDataProvider(),
      await new PrismaLedgerRepository().list(),
      instrumentId,
      symbol,
    );
    if (!check) {
      console.log(
        `  ⚠ no quote returned for ${symbol} — try another venue (.MI, .PA, .F).`,
      );
      return;
    }

    const stale = check.fresh
      ? ""
      : "  ⚠ STALE timestamp — likely the wrong/illiquid venue";
    console.log(
      `  → ${check.name ?? "(no name)"}: ${check.price} ${check.currency} @ ${check.asOf}${stale}`,
    );
    for (const trade of check.trades) {
      const pct = new Decimal(trade.deviation).mul(100).toFixed(1);
      console.log(
        `  → ${trade.ts.slice(0, 10)}: traded at ${trade.traded}, closed at ${trade.close} (${pct}%)${trade.off ? "  ⚠" : ""}`,
      );
    }
    if (check.tradesOff) {
      console.log(
        "  ⚠ your trades and this symbol's closes disagree: likely the wrong venue or share class.",
      );
    }
    if (check.foreignCurrency) {
      console.log(
        `  ⚠ quotes in ${check.foreignCurrency}: only EUR histories are valued, so the history will be refused. Pick the EUR line on another venue.`,
      );
    }
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

  if (symbolArg === "--clear") {
    const removed = await clearQuoteSymbol(
      repo,
      new PrismaPriceRepository(),
      id,
    );
    console.log(
      `${instrument.id}  ${instrument.name}
  quoteSymbol: (cleared), ${removed} price snapshot(s) removed`,
    );
    return;
  }

  const prices = new PrismaPriceRepository();
  const rangeArg = argv.slice(2).find((arg) => isHistoryRange(arg));
  const earliest = (await prices.candleTimes()).get(id)?.[0] ?? null;
  const range = rangeArg ?? rangeSince(earliest, new Date());

  await preview(symbolArg, id);

  const outcome = await replaceQuoteHistory(
    {
      instruments: repo,
      prices,
      provider: new YahooMarketDataProvider(),
    },
    { instrumentId: id, symbol: symbolArg, range },
  );

  if (!outcome.ok) {
    const why =
      outcome.reason === "not-eur"
        ? `history is in ${outcome.currency}; only EUR histories are valued`
        : "no daily history returned";
    console.error(`
${symbolArg}: ${why}. Nothing was changed.`);
    exit(1);
  }

  console.log(
    `${instrument.id}  ${instrument.name}
  quoteSymbol: ${symbolArg}
  ${outcome.removed} old snapshot(s) replaced by ${outcome.written} (${range}, ${outcome.first.slice(0, 10)} → ${outcome.last.slice(0, 10)})${outcome.live ? "" : ", no fresh quote today"}`,
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
