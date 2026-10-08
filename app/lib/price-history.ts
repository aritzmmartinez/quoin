import { isFreshQuote } from "~/adapters/marketdata";
import { foreignCurrency } from "~/core/domain";
import type {
  HistoryRange,
  InstrumentRepository,
  MarketDataProvider,
  PriceRepository,
  PriceSnapshot,
  Quote,
} from "~/core/ports";

import type { Copy } from "./i18n";
import { inTurn } from "./in-turn";

export interface ReplaceHistoryDeps {
  instruments: InstrumentRepository;
  prices: PriceRepository;
  provider: MarketDataProvider;
  now?: Date;
}

export interface ReplaceHistoryRequest {
  instrumentId: string;
  symbol: string;
  range: HistoryRange;
}

export type ReplaceFailure = "no-history" | "not-eur" | "failed";

export type ReplaceOutcome =
  | {
      ok: true;
      instrumentId: string;
      symbol: string;
      removed: number;
      written: number;
      first: string;
      last: string;
      live: boolean;
    }
  | {
      ok: false;
      instrumentId: string;
      symbol: string;
      reason: ReplaceFailure;
      currency: string | null;
    };

function dailyCandles(quotes: readonly Quote[]): Quote[] {
  const byTime = new Map<number, Quote>();
  for (const quote of quotes) byTime.set(quote.asOf.getTime(), quote);
  return [...byTime.values()].sort(
    (a, b) => a.asOf.getTime() - b.asOf.getTime(),
  );
}

async function liveQuote(
  provider: MarketDataProvider,
  symbol: string,
  after: Date,
  now: Date,
): Promise<Quote | null> {
  let quotes: Quote[];
  try {
    quotes = await provider.getQuotes([symbol]);
  } catch {
    return null;
  }
  const quote = quotes.find((q) => q.symbol === symbol);
  if (!quote) return null;
  if (foreignCurrency([quote])) return null;
  if (!isFreshQuote(quote, now)) return null;
  if (quote.asOf.getTime() <= after.getTime()) return null;
  return quote;
}

export async function replaceQuoteHistory(
  deps: ReplaceHistoryDeps,
  request: ReplaceHistoryRequest,
): Promise<ReplaceOutcome> {
  const { instruments, prices, provider } = deps;
  const { instrumentId, symbol, range } = request;
  const now = deps.now ?? new Date();

  const instrument = await instruments.get(instrumentId);
  if (!instrument) throw new Error(`No instrument with id "${instrumentId}".`);

  const failure = (reason: ReplaceFailure, currency: string | null = null) =>
    ({ ok: false, instrumentId, symbol, reason, currency }) as const;

  let history: Quote[];
  try {
    history = dailyCandles(await provider.getHistory(symbol, range));
  } catch {
    return failure("no-history");
  }

  const first = history[0];
  const last = history[history.length - 1];
  if (!first || !last) return failure("no-history");

  const foreign = foreignCurrency(history);
  if (foreign) return failure("not-eur", foreign);

  const live = await liveQuote(provider, symbol, last.asOf, now);
  const unchanged = instrument.quoteSymbol === symbol;

  const snapshots: PriceSnapshot[] = [...history, ...(live ? [live] : [])].map(
    (quote) => ({
      instrumentId,
      price: quote.price,
      currency: quote.currency,
      asOf: quote.asOf,
      source: provider.source,
    }),
  );

  const removed = await prices.replaceHistory(instrumentId, snapshots, {
    ...(unchanged ? {} : { quoteSymbol: symbol }),
    ...(unchanged && !live ? { keepAfter: last.asOf } : {}),
  });

  return {
    ok: true,
    instrumentId,
    symbol,
    removed,
    written: snapshots.length,
    first: first.asOf.toISOString(),
    last: (live ?? last).asOf.toISOString(),
    live: live !== null,
  };
}

export async function replaceQuoteHistories(
  deps: ReplaceHistoryDeps,
  requests: readonly ReplaceHistoryRequest[],
  onEach?: (outcome: ReplaceOutcome, index: number) => void,
): Promise<ReplaceOutcome[]> {
  return inTurn(requests, (request) => replaceQuoteHistory(deps, request), {
    onError: (_error, request): ReplaceOutcome => ({
      ok: false,
      instrumentId: request.instrumentId,
      symbol: request.symbol,
      reason: "failed",
      currency: null,
    }),
    ...(onEach ? { onEach } : {}),
  });
}

export function replaceFailureMessage(
  t: Copy,
  outcome: Extract<ReplaceOutcome, { ok: false }>,
): string {
  const copy = t.instruments.history;
  switch (outcome.reason) {
    case "no-history":
      return copy.noHistory(outcome.symbol);
    case "not-eur":
      return copy.notEur(outcome.symbol, outcome.currency ?? "?");
    case "failed":
      return copy.failed;
  }
}
