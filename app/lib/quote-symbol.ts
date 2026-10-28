import { dayOf, shiftDay } from "~/core/calendar";
import type {
  InstrumentRepository,
  MarketDataProvider,
  PriceRepository,
} from "~/core/ports";

import { rateSeriesOf, type EnsureRates } from "./fx-sync";
import { hasDailyHistory, RATE_PROBE_DAYS } from "./symbol-check";

export type AssignResult =
  | { ok: true }
  | { ok: false; reason: "has-history" | "no-quote" | "no-history" }
  | {
      ok: false;
      reason: "no-rate-series" | "rates-unavailable";
      currency: string;
    };

export async function assignQuoteSymbol(
  instruments: InstrumentRepository,
  prices: PriceRepository,
  provider: MarketDataProvider,
  id: string,
  symbol: string,
  rates: EnsureRates,
  zone: string,
  now: Date = new Date(),
): Promise<AssignResult> {
  const instrument = await instruments.get(id);
  if (!instrument) throw new Error(`No instrument with id "${id}".`);

  const changes = instrument.quoteSymbol !== symbol;
  if (changes && (await prices.latest()).has(id)) {
    return { ok: false, reason: "has-history" };
  }

  const quote = await provider.getQuote(symbol);
  if (!quote) return { ok: false, reason: "no-quote" };
  const series = rateSeriesOf(
    await rates(
      new Map([[quote.currency, shiftDay(dayOf(now, zone), -RATE_PROBE_DAYS)]]),
    ),
    quote.currency,
  );
  if (series === "none" || series === "unavailable") {
    return {
      ok: false,
      reason: series === "none" ? "no-rate-series" : "rates-unavailable",
      currency: quote.currency,
    };
  }
  if (!(await hasDailyHistory(provider, symbol))) {
    return { ok: false, reason: "no-history" };
  }

  if (changes) await instruments.setQuoteSymbol(id, symbol);
  return { ok: true };
}

export async function clearQuoteSymbol(
  instruments: InstrumentRepository,
  prices: PriceRepository,
  id: string,
): Promise<number> {
  const instrument = await instruments.get(id);
  if (!instrument) throw new Error(`No instrument with id "${id}".`);

  return prices.replaceHistory(id, [], { quoteSymbol: null });
}
