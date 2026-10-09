import {
  KrakenCsvAdapter,
  TradeRepublicCsvAdapter,
  detectBroker,
  persistBatch,
  previewBatch,
  type Broker,
  type MappedBatch,
} from "~/adapters/ingestion";
import { YahooMarketDataProvider } from "~/adapters/marketdata";
import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
} from "~/adapters/persistence";
import type { HistoryRange } from "~/core/ports";
import { computePositions } from "~/core/projections";

import type { Copy } from "./i18n";
import {
  rewardRetryIds,
  type IngestPreview,
  type IngestResult,
  type PendingMapping,
  type PriceFillResult,
} from "./ingest";
import { backfillInstruments } from "./prices-backfill";
import { syncPrices } from "./prices-sync.server";
import { replaceQuoteHistory, type ReplaceOutcome } from "./price-history";
import { assignQuoteSymbol } from "./quote-symbol";
import {
  checkQuoteAgainstLedger,
  heldQuantity,
  type SymbolCheck,
} from "./symbol-check";

export type * from "./ingest";

export class IngestError extends Error {}

async function plan(
  t: Copy,
  csv: string,
): Promise<{ broker: Broker; batch: MappedBatch }> {
  const broker = detectBroker(csv);
  if (!broker) throw new IngestError(t.ingest.unknownBroker);

  const instruments = new PrismaInstrumentRepository();
  const ledger = new PrismaLedgerRepository();

  const batch =
    broker === "kraken"
      ? await new KrakenCsvAdapter(
          instruments,
          ledger,
          new PrismaPriceRepository(),
        ).plan(csv)
      : new TradeRepublicCsvAdapter(instruments, ledger).plan(csv);

  return { broker, batch };
}

export async function previewIngest(
  t: Copy,
  csv: string,
): Promise<IngestPreview> {
  const { broker, batch } = await plan(t, csv);
  const summary = await previewBatch(new PrismaLedgerRepository(), batch);
  return { broker, summary };
}

export async function commitIngest(
  t: Copy,
  csv: string,
): Promise<IngestResult> {
  const { broker, batch } = await plan(t, csv);
  const instruments = new PrismaInstrumentRepository();
  const ledger = new PrismaLedgerRepository();

  const summary = await persistBatch(instruments, ledger, batch);

  return {
    broker,
    summary,
    pending: await pendingMappings(batch),
    retryIds: rewardRetryIds(summary),
  };
}

async function pendingMappings(batch: MappedBatch): Promise<PendingMapping[]> {
  if (batch.instruments.length === 0) return [];

  const touched = new Set(batch.instruments.map((i) => i.id));
  const [stored, events] = await Promise.all([
    new PrismaInstrumentRepository().list(),
    new PrismaLedgerRepository().list(),
  ]);
  const positions = computePositions(events);

  return stored
    .filter((i) => touched.has(i.id) && !i.quoteSymbol)
    .map((i) => ({
      instrumentId: i.id,
      name: i.name,
      quantity: heldQuantity(positions, i.id),
    }));
}

export async function checkQuoteSymbol(
  t: Copy,
  instrumentId: string,
  symbol: string,
): Promise<SymbolCheck> {
  const check = await checkQuoteAgainstLedger(
    new YahooMarketDataProvider(),
    await new PrismaLedgerRepository().list(),
    instrumentId,
    symbol,
  );
  if (!check) throw new IngestError(t.ingest.map.noQuote(symbol));
  return check;
}

export async function mapQuoteSymbol(
  t: Copy,
  instrumentId: string,
  symbol: string,
): Promise<void> {
  const result = await assignQuoteSymbol(
    new PrismaInstrumentRepository(),
    new PrismaPriceRepository(),
    new YahooMarketDataProvider(),
    instrumentId,
    symbol,
  );
  if (result.ok) return;
  switch (result.reason) {
    case "has-history":
      throw new IngestError(t.ingest.map.hasHistory);
    case "no-quote":
      throw new IngestError(t.ingest.map.noQuote(symbol));
    case "not-eur":
      throw new IngestError(t.ingest.map.notEur(result.currency));
  }
}

export async function replaceHistory(
  instrumentId: string,
  symbol: string,
  range: HistoryRange,
): Promise<ReplaceOutcome> {
  return replaceQuoteHistory(
    {
      instruments: new PrismaInstrumentRepository(),
      prices: new PrismaPriceRepository(),
      provider: new YahooMarketDataProvider(),
    },
    { instrumentId, symbol, range },
  );
}

export async function fillPrices(
  instrumentIds: readonly string[],
  range: HistoryRange,
): Promise<PriceFillResult> {
  const instruments = new PrismaInstrumentRepository();
  const prices = new PrismaPriceRepository();
  const provider = new YahooMarketDataProvider();

  const wanted = new Set(instrumentIds);
  const targets = (await instruments.list())
    .filter((i) => wanted.has(i.id) && i.quoteSymbol)
    .map((i) => ({ id: i.id, quoteSymbol: i.quoteSymbol! }));

  const backfilled = await backfillInstruments(
    provider,
    prices,
    targets,
    range,
  );

  const refused = new Set(
    backfilled.filter((r) => r.foreignCurrency).map((r) => r.instrumentId),
  );
  const sync = await syncPrices({
    instruments,
    prices,
    provider,
    only: targets.map((t) => t.id).filter((id) => !refused.has(id)),
  });

  return {
    backfilled,
    candles: backfilled.reduce((sum, report) => sum + report.written, 0),
    synced: sync.updated,
    stale: sync.failures.filter((f) => f.reason === "stale").length,
    noQuote: sync.failures.filter((f) => f.reason === "no-quote").length,
    notEur: refused.size,
  };
}
