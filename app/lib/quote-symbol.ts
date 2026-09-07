import type { InstrumentRepository, PriceRepository } from "~/core/ports";

export interface RemapResult {
  symbol: string | null;
  removed: number;
}

export async function remapQuoteSymbol(
  instruments: InstrumentRepository,
  prices: PriceRepository,
  id: string,
  symbol: string | null,
): Promise<RemapResult> {
  const instrument = await instruments.get(id);
  if (!instrument) throw new Error(`No instrument with id "${id}".`);

  const removed =
    symbol === instrument.quoteSymbol
      ? 0
      : await prices.deleteForInstrument(id);

  await instruments.setQuoteSymbol(id, symbol);

  return { symbol, removed };
}
