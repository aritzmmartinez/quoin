import { describe, expect, it } from "vitest";

import type { Instrument } from "~/core/domain";
import type { OpportunityCostLine } from "~/core/projections";

import {
  DEFAULT_BENCHMARK_SYMBOL,
  findBenchmark,
  namesOf,
  resolveBenchmarkSymbol,
  toOpportunityRows,
} from "./opportunity-cost";

const instrument = (
  id: string,
  name: string,
  quoteSymbol?: string,
): Instrument => ({
  id,
  name,
  type: "ETF",
  currency: "EUR",
  quoteSymbol,
});

const line = (
  instrumentId: string,
  difference: string,
): OpportunityCostLine => ({
  instrumentId,
  contributed: "1000",
  realValue: "1200",
  benchmarkValue: "1100",
  difference,
});

describe("findBenchmark", () => {
  it("resolves the instrument by quote symbol, not by id", () => {
    const instruments = [
      instrument(
        "IE00B3RBWM25",
        "Vanguard All-World",
        DEFAULT_BENCHMARK_SYMBOL,
      ),
      instrument("VWCE.DE", "Ghost with the symbol as its id"),
    ];

    expect(findBenchmark(instruments)?.id).toBe("IE00B3RBWM25");
  });

  it("returns null when nobody mapped the symbol", () => {
    expect(findBenchmark([instrument("A", "Something")])).toBeNull();
  });
});

describe("resolveBenchmarkSymbol", () => {
  it("uses the configured symbol when the env var is set", () => {
    expect(resolveBenchmarkSymbol("IWDA.AS")).toBe("IWDA.AS");
    expect(resolveBenchmarkSymbol("  SWRD.MI  ")).toBe("SWRD.MI");
  });

  it("falls back to the default when unset, empty or whitespace", () => {
    expect(resolveBenchmarkSymbol(undefined)).toBe(DEFAULT_BENCHMARK_SYMBOL);
    expect(resolveBenchmarkSymbol("")).toBe(DEFAULT_BENCHMARK_SYMBOL);
    expect(resolveBenchmarkSymbol("   ")).toBe(DEFAULT_BENCHMARK_SYMBOL);
    expect(DEFAULT_BENCHMARK_SYMBOL).toBe("VWCE.DE");
  });
});

describe("toOpportunityRows", () => {
  it("names the lines and keeps the projection's order", () => {
    const rows = toOpportunityRows(
      [line("B", "900"), line("A", "-400")],
      [instrument("A", "Alpha"), instrument("B", "Beta")],
    );

    expect(rows.map((r) => r.name)).toEqual(["Beta", "Alpha"]);
  });

  it("falls back to the id for an instrument that was never imported", () => {
    expect(toOpportunityRows([line("GHOST", "1")], [])[0]?.name).toBe("GHOST");
  });
});

describe("namesOf", () => {
  it("names what it can and leaves the rest as ids", () => {
    expect(namesOf(["A", "Z"], [instrument("A", "Alpha")])).toEqual([
      "Alpha",
      "Z",
    ]);
  });
});
