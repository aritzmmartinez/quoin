import { foreignCurrency } from "~/core/domain";
import type {
  InstrumentRepository,
  MarketDataProvider,
  PriceRepository,
} from "~/core/ports";

export type AssignResult =
  | { ok: true }
  | { ok: false; reason: "has-history" | "no-quote" }
  | { ok: false; reason: "not-eur"; currency: string };

export async function assignQuoteSymbol(
  instruments: InstrumentRepository,
  prices: PriceRepository,
  provider: MarketDataProvider,
  id: string,
  symbol: string,
): Promise<AssignResult> {
  const instrument = await instruments.get(id);
  if (!instrument) throw new Error(`No instrument with id "${id}".`);

  const changes = instrument.quoteSymbol !== symbol;
  if (changes && (await prices.latest()).has(id)) {
    return { ok: false, reason: "has-history" };
  }

  const [quote] = await provider.getQuotes([symbol]);
  if (!quote) return { ok: false, reason: "no-quote" };
  const foreign = foreignCurrency([quote]);
  if (foreign) return { ok: false, reason: "not-eur", currency: foreign };

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
