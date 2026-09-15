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
import type {
  IngestPreview,
  IngestResult,
  PendingMapping,
  PriceFillResult,
} from "./ingest";
import { backfillInstruments } from "./prices-backfill";
import { syncPrices } from "./prices-sync.server";
import { remapQuoteSymbol } from "./quote-symbol";
import { checkSymbol, heldQuantity, type SymbolCheck } from "./symbol-check";

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

  return { broker, summary, pending: await pendingMappings(batch) };
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
  const [quote] = await new YahooMarketDataProvider().getQuotes([symbol]);
  if (!quote) throw new IngestError(t.ingest.map.noQuote(symbol));

  const events = await new PrismaLedgerRepository().list();
  return checkSymbol(
    quote,
    heldQuantity(computePositions(events), instrumentId),
  );
}

export async function mapQuoteSymbol(
  instrumentId: string,
  symbol: string,
): Promise<{ removed: number }> {
  return remapQuoteSymbol(
    new PrismaInstrumentRepository(),
    new PrismaPriceRepository(),
    instrumentId,
    symbol,
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

  const sync = await syncPrices({
    instruments,
    prices,
    provider,
    only: targets.map((t) => t.id),
  });

  return {
    backfilled,
    candles: backfilled.reduce((sum, report) => sum + report.written, 0),
    synced: sync.updated,
    stale: sync.failures.filter((f) => f.reason === "stale").length,
    noQuote: sync.failures.filter((f) => f.reason === "no-quote").length,
  };
}
