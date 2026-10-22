import { describe, expect, it } from "vitest";

import type { Instrument } from "~/core/domain";
import { rateBookFrom } from "~/core/fx";
import type { OpportunityCostLine } from "~/core/projections";

import {
  BENCHMARK_COOKIE,
  benchmarkCandidates,
  convertibleStarts,
  DEFAULT_BENCHMARK_SYMBOL,
  findBenchmark,
  namesOf,
  parseBenchmark,
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
  quoteSymbol,
  thesis: "CORE",
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

describe("parseBenchmark", () => {
  const of = (value: string) => parseBenchmark(`${BENCHMARK_COOKIE}=${value}`);

  it("reads the chosen symbol, percent-decoded, from its cookie", () => {
    expect(of("IWDA.AS")).toBe("IWDA.AS");
    expect(of(encodeURIComponent("EURUSD=X"))).toBe("EURUSD=X");
    expect(of(encodeURIComponent("^STOXX50E"))).toBe("^STOXX50E");
    expect(
      parseBenchmark(`quoin-theme=dark; ${BENCHMARK_COOKIE}=SWRD.MI`),
    ).toBe("SWRD.MI");
  });

  it("falls back to the default when absent, empty, blank or malformed", () => {
    expect(parseBenchmark(null)).toBe(DEFAULT_BENCHMARK_SYMBOL);
    expect(parseBenchmark("quoin-theme=dark")).toBe(DEFAULT_BENCHMARK_SYMBOL);
    expect(of("")).toBe(DEFAULT_BENCHMARK_SYMBOL);
    expect(of("%20%20")).toBe(DEFAULT_BENCHMARK_SYMBOL);
    expect(of("%E0%A4%A")).toBe(DEFAULT_BENCHMARK_SYMBOL);
    expect(DEFAULT_BENCHMARK_SYMBOL).toBe("VWCE.DE");
  });
});

describe("convertibleStarts", () => {
  const book = rateBookFrom([
    {
      source: "ECB",
      base: "EUR",
      quote: "USD",
      day: "2020-01-02",
      rate: "1.1",
    },
  ]);
  const start = (iso: string) => new Date(iso);

  it("keeps a euro history from its first close", () => {
    expect(
      convertibleStarts(
        new Map([
          ["EUR", new Map([["IE00TEST0001", start("2019-05-01T16:00:00Z")]])],
        ]),
        book,
      ),
    ).toEqual(new Map([["IE00TEST0001", start("2019-05-01T16:00:00Z")]]));
  });

  it("starts a history in another currency at its first close that has a rate", () => {
    const starts = convertibleStarts(
      new Map([
        [
          "USD",
          new Map([
            ["US00TEST0001", start("2020-01-03T21:00:00Z")],
            ["US00TEST0002", start("2015-06-01T21:00:00Z")],
          ]),
        ],
      ]),
      book,
    );

    expect(starts.get("US00TEST0001")).toEqual(start("2020-01-03T21:00:00Z"));
    expect(starts.get("US00TEST0002")).toEqual(start("2020-01-02T12:00:00Z"));
  });

  it("offers nothing in a currency with no rates", () => {
    expect(
      convertibleStarts(
        new Map([
          ["GBP", new Map([["GB00TEST0001", start("2020-01-03T16:00:00Z")]])],
        ]),
        book,
      ).size,
    ).toBe(0);
  });
});

describe("benchmarkCandidates", () => {
  const start = new Date("2021-03-01T00:00:00Z");

  it("offers only instruments with both a quote symbol and EUR history", () => {
    const candidates = benchmarkCandidates(
      [
        instrument("A", "Mapped with history", "AAA.DE"),
        instrument("B", "Mapped, no EUR history", "BBB.DE"),
        instrument("C", "History but unmapped"),
      ],
      new Map([
        ["A", start],
        ["C", start],
      ]),
    );

    expect(candidates).toEqual([
      {
        symbol: "AAA.DE",
        instrumentId: "A",
        name: "Mapped with history",
        since: "2021-03-01T00:00:00.000Z",
      },
    ]);
  });

  it("sorts by name, not by symbol or id", () => {
    const candidates = benchmarkCandidates(
      [instrument("1", "Zeta", "AAA"), instrument("2", "Alfa", "ZZZ")],
      new Map([
        ["1", start],
        ["2", start],
      ]),
    );

    expect(candidates.map((c) => c.name)).toEqual(["Alfa", "Zeta"]);
  });

  it("offers nothing when nothing qualifies, rather than a default", () => {
    expect(benchmarkCandidates([instrument("A", "Alpha")], new Map())).toEqual(
      [],
    );
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
