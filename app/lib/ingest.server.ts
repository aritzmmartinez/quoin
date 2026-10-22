import {
  InvalidLedgerEventError,
  KrakenBalanceMismatchError,
  KrakenCsvAdapter,
  KrakenLegacyExportError,
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
  PrismaPriceSyncRepository,
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
import { ensureRatesNow } from "./fx-sync.server";
import { planWithRates } from "./ingest-rates";
import { backfillInstruments } from "./prices-backfill";
import { loadRateBook } from "./rate-book.server";
import { inTurn } from "./in-turn";
import {
  failedSync,
  syncInstrumentPrices,
  haltsSync,
  syncProblemOf,
  type SyncProblem,
} from "./prices-sync";
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
  const adapter =
    broker === "kraken"
      ? new KrakenCsvAdapter(
          instruments,
          ledger,
          new PrismaPriceRepository(),
          loadRateBook,
        )
      : new TradeRepublicCsvAdapter(instruments, ledger, loadRateBook);

  try {
    const batch = await planWithRates(() => adapter.plan(csv), ensureRatesNow);
    return { broker, batch };
  } catch (error) {
    if (error instanceof InvalidLedgerEventError) {
      throw new IngestError(
        t.ingest.invalidEvent(error.date, error.type, error.currency),
      );
    }
    if (error instanceof KrakenLegacyExportError) {
      throw new IngestError(t.ingest.krakenLegacyExport);
    }
    if (error instanceof KrakenBalanceMismatchError) {
      throw new IngestError(
        t.ingest.krakenBalanceMismatch(error.asset, error.wallet, error.date),
      );
    }
    throw error;
  }
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
    ensureRatesNow,
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
    ensureRatesNow,
  );
  if (result.ok) return;
  switch (result.reason) {
    case "has-history":
      throw new IngestError(t.ingest.map.hasHistory);
    case "no-quote":
      throw new IngestError(t.ingest.map.noQuote(symbol));
    case "no-rate-series":
      throw new IngestError(t.fx.noRateSeries(result.currency));
    case "rates-unavailable":
      throw new IngestError(t.fx.sync.unavailable);
    case "no-history":
      throw new IngestError(t.ingest.map.noDailyHistory);
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
      rates: ensureRatesNow,
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
  const checks = new PrismaPriceSyncRepository();

  const wanted = new Set(instrumentIds);
  const targets = (await instruments.list()).flatMap((i) =>
    wanted.has(i.id) && i.quoteSymbol
      ? [{ id: i.id, name: i.name, quoteSymbol: i.quoteSymbol }]
      : [],
  );

  const backfilled = await backfillInstruments(
    provider,
    prices,
    targets,
    range,
    ensureRatesNow,
  );

  for (const report of backfilled) {
    if (report.unavailable) {
      console.error(
        "Price backfill failed",
        report.instrumentId,
        report.unavailable,
      );
    }
  }
  const refused = new Set(
    backfilled.filter((r) => r.noRateSeries).map((r) => r.instrumentId),
  );
  const unreachable = new Set(
    backfilled.filter((r) => r.unavailable).map((r) => r.instrumentId),
  );
  const unrated = new Set(
    backfilled.filter((r) => r.ratesUnavailable).map((r) => r.instrumentId),
  );
  const synced = await inTurn(
    targets.filter(
      (t) => !refused.has(t.id) && !unreachable.has(t.id) && !unrated.has(t.id),
    ),
    (target) => syncInstrumentPrices({ prices, provider, checks }, target),
    {
      onError: (error, target) => {
        if (haltsSync(error)) throw error;
        console.error("Price sync failed", target.id, error);
        return failedSync(target, syncProblemOf(error));
      },
    },
  );
  for (const step of synced) {
    if (step.problem === "unavailable") unreachable.add(step.instrumentId);
  }
  const count = (problem: SyncProblem) =>
    synced.filter((s) => s.problem === problem).length;

  return {
    backfilled,
    candles: backfilled.reduce((sum, report) => sum + report.written, 0),
    synced: synced.filter((s) => s.live).length,
    stale: count("stale"),
    noQuote: count("no-quote"),
    noRateSeries: refused.size,
    unavailable: targets
      .filter((t) => unreachable.has(t.id))
      .map((t) => t.name),
    ratesUnavailable: targets
      .filter((t) => unrated.has(t.id))
      .map((t) => t.name),
  };
}
