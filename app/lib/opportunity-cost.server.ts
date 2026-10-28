import { PrismaPriceRepository } from "~/adapters/persistence";
import type { Instrument, LedgerEvent } from "~/core/domain";
import { historyInBase, type RateBook } from "~/core/fx";
import {
  computeOpportunityCost,
  type OpportunityCostResult,
  type PriceLike,
} from "~/core/projections";

import { firstTradeAt } from "./history-start";
import { findBenchmark } from "./opportunity-cost";

export type OpportunityView =
  | { ok: false; symbol: string; reason: "unmapped" | "no-history" }
  | {
      ok: true;
      symbol: string;
      benchmarkId: string;
      benchmarkName: string;
      result: OpportunityCostResult;
    };

export async function loadOpportunityCost(
  events: readonly LedgerEvent[],
  instruments: readonly Instrument[],
  valuation: { prices: ReadonlyMap<string, PriceLike>; book: RateBook },
  symbol: string,
  zone: string,
  now: Date = new Date(),
): Promise<OpportunityView> {
  const benchmark = findBenchmark(instruments, symbol);
  if (!benchmark) return { ok: false, symbol, reason: "unmapped" };

  const stored = await new PrismaPriceRepository().historyFor(
    benchmark.id,
    firstTradeAt(events),
  );
  const { history } = historyInBase(stored, valuation.book, zone);
  if (history.length === 0) {
    return { ok: false, symbol, reason: "no-history" };
  }

  return {
    ok: true,
    symbol,
    benchmarkId: benchmark.id,
    benchmarkName: benchmark.name,
    result: computeOpportunityCost({
      events,
      benchmarkInstrumentId: benchmark.id,
      benchmarkHistory: history,
      prices: valuation.prices,
      now,
      zone,
    }),
  };
}
