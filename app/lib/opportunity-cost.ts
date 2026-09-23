import type { Instrument } from "~/core/domain";
import type { OpportunityCostLine } from "~/core/projections";

import { readCookie } from "./cookie";

export const DEFAULT_BENCHMARK_SYMBOL = "VWCE.DE";
export const BENCHMARK_COOKIE = "quoin-benchmark";

export function parseBenchmark(cookieHeader: string | null): string {
  const value = readCookie(cookieHeader, BENCHMARK_COOKIE)?.trim();
  return value ? value : DEFAULT_BENCHMARK_SYMBOL;
}

export interface BenchmarkCandidate {
  symbol: string;
  instrumentId: string;
  name: string;
  since: string;
}

/**
 * What the benchmark setting may offer: an instrument with a quote symbol and
 * at least one EUR close — exactly what `loadOpportunityCost` refuses without.
 * `historyStarts` maps instrumentId to its first EUR close; an instrument
 * missing from it has no EUR history and is left out, not offered with a
 * warning. Sorted by name, like every other instrument list.
 */
export function benchmarkCandidates(
  instruments: readonly Instrument[],
  historyStarts: ReadonlyMap<string, Date>,
  tag = "es-ES",
): BenchmarkCandidate[] {
  const candidates: BenchmarkCandidate[] = [];
  for (const instrument of instruments) {
    const symbol = instrument.quoteSymbol;
    const since = historyStarts.get(instrument.id);
    if (!symbol || !since) continue;
    candidates.push({
      symbol,
      instrumentId: instrument.id,
      name: instrument.name,
      since: since.toISOString(),
    });
  }
  return candidates.sort((a, b) => a.name.localeCompare(b.name, tag));
}

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
  symbol: string = DEFAULT_BENCHMARK_SYMBOL,
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
