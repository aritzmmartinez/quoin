import type { Instrument } from "~/core/domain";
import type { OpportunityCostLine } from "~/core/projections";

export const BENCHMARK_SYMBOL = "VWCE.DE";

export interface OpportunityRow {
  instrumentId: string;
  name: string;
  contributed: string;
  realValue: string;
  benchmarkValue: string;
  difference: string;
}

export function findBenchmark(
  instruments: readonly Instrument[],
  symbol: string = BENCHMARK_SYMBOL,
): Instrument | null {
  return instruments.find((i) => i.quoteSymbol === symbol) ?? null;
}

export function toOpportunityRows(
  lines: readonly OpportunityCostLine[],
  instruments: readonly Instrument[],
): OpportunityRow[] {
  const byId = new Map(instruments.map((i) => [i.id, i]));
  return lines.map((line) => ({
    ...line,
    name: byId.get(line.instrumentId)?.name ?? line.instrumentId,
  }));
}

export function namesOf(
  instrumentIds: readonly string[],
  instruments: readonly Instrument[],
): string[] {
  const byId = new Map(instruments.map((i) => [i.id, i]));
  return instrumentIds.map((id) => byId.get(id)?.name ?? id);
}
