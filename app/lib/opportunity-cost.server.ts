import { PrismaPriceRepository } from "~/adapters/persistence";
import {
  BASE_CURRENCY,
  type Instrument,
  type LedgerEvent,
} from "~/core/domain";
import {
  computeOpportunityCost,
  type OpportunityCostResult,
  type PriceLike,
} from "~/core/projections";

import { findBenchmark, resolveBenchmarkSymbol } from "./opportunity-cost";

const BENCHMARK_SYMBOL = resolveBenchmarkSymbol(process.env.BENCHMARK_SYMBOL);

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
  prices: ReadonlyMap<string, PriceLike>,
  symbol: string = BENCHMARK_SYMBOL,
  now: Date = new Date(),
): Promise<OpportunityView> {
  const benchmark = findBenchmark(instruments, symbol);
  if (!benchmark) return { ok: false, symbol, reason: "unmapped" };

  const history = await new PrismaPriceRepository().historyFor(benchmark.id);
  if (!history.some((snapshot) => snapshot.currency === BASE_CURRENCY)) {
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
      prices,
      now,
    }),
  };
}
