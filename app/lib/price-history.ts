import { isFreshQuote } from "~/adapters/marketdata";
import { dayOf } from "~/core/calendar";
import {
  MarketDataUnavailableError,
  type HistoryRange,
  type InstrumentRepository,
  type MarketDataProvider,
  type PriceRepository,
  type PriceSnapshot,
  type Quote,
} from "~/core/ports";
import { liveSource } from "~/core/prices";

import { rateSeriesOf, type EnsureRates } from "./fx-sync";
import type { Copy } from "./i18n";
import { inTurn } from "./in-turn";

export interface ReplaceHistoryDeps {
  instruments: InstrumentRepository;
  prices: PriceRepository;
  provider: MarketDataProvider;
  rates: EnsureRates;
  now?: Date;
}

export interface ReplaceHistoryRequest {
  instrumentId: string;
  symbol: string;
  range: HistoryRange;
}

export type ReplaceFailure =
  | "no-history"
  | "no-rate-series"
  | "rates-unavailable"
  | "unavailable"
  | "failed";

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
  currency: string,
  after: Date,
  now: Date,
): Promise<Quote | null> {
  let quote: Quote | null;
  try {
    quote = await provider.getQuote(symbol);
  } catch {
    return null;
  }
  if (!quote) return null;
  if (quote.currency !== currency) return null;
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

  const history = dailyCandles(await provider.getHistory(symbol, range));

  const first = history[0];
  const last = history[history.length - 1];
  if (!first || !last) return failure("no-history");

  const currencies = [...new Set(history.map((quote) => quote.currency))];
  if (currencies.length > 1) return failure("failed", currencies.join(", "));
  const currency = first.currency;
  const series = rateSeriesOf(
    await deps.rates(new Map([[currency, dayOf(first.asOf)]])),
    currency,
  );
  if (series === "none") return failure("no-rate-series", currency);
  if (series === "unavailable") return failure("rates-unavailable", currency);

  const live = await liveQuote(provider, symbol, currency, last.asOf, now);
  const unchanged = instrument.quoteSymbol === symbol;

  const snapshot = (quote: Quote, source: string): PriceSnapshot => ({
    instrumentId,
    price: quote.price,
    currency: quote.currency,
    asOf: quote.asOf,
    source,
  });
  const snapshots: PriceSnapshot[] = [
    ...history.map((quote) => snapshot(quote, provider.source)),
    ...(live ? [snapshot(live, liveSource(provider.source))] : []),
  ];

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
    onError: (error, request): ReplaceOutcome => ({
      ok: false,
      instrumentId: request.instrumentId,
      symbol: request.symbol,
      reason:
        error instanceof MarketDataUnavailableError ? "unavailable" : "failed",
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
    case "no-rate-series":
      return t.fx.noRateSeriesHistory(outcome.symbol, outcome.currency ?? "?");
    case "rates-unavailable":
      return t.fx.sync.unavailable;
    case "unavailable":
      return t.common.marketDataUnavailable;
    case "failed":
      return copy.failed;
  }
}
