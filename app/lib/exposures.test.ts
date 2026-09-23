import { describe, expect, it } from "vitest";

import type { CachedIdentity } from "~/core/ports";
import type { LeafExposure } from "~/core/projections";

import {
  CONCENTRATION_THRESHOLD,
  DEFAULT_ALLOCATION_VIEW,
  DEFAULT_OVERLAP_MODE,
  currencyByLeaf,
  includeSoldHref,
  isCashLine,
  modeHref,
  parseAllocationView,
  parseIncludeSold,
  parseOverlapMode,
  viewHref,
  readingFor,
  PRESENTATION_THRESHOLD,
  isConcentrated,
  tailOf,
  parseThreshold,
  THRESHOLD_MAX_PERCENT,
  THRESHOLD_MIN_PERCENT,
  THRESHOLD_COOKIE,
  thresholdPercent,
  toExposureRows,
} from "./exposures";

const leaf = (
  id: string,
  value: string,
  kind: LeafExposure["leaf"]["kind"] = "COMPANY",
  contributions = 1,
): LeafExposure => ({
  leaf: { kind, id },
  name: id,
  contributions: Array.from({ length: contributions }, (_, i) => ({
    instrumentId: `parent${i}`,
    instrumentName: id,
    value: (Number(value) / contributions).toFixed(2),
    weightInParent: i === 0 ? null : "0.045",
  })),
});

describe("the two thresholds are different axes", () => {
  it("keeps them apart: presentation is far below concentration", () => {
    expect(Number(PRESENTATION_THRESHOLD)).toBeLessThan(
      Number(CONCENTRATION_THRESHOLD),
    );
  });

  it("flags a leaf above the concentration threshold", () => {
    expect(isConcentrated("0.16")).toBe(true);
    expect(isConcentrated("0.15")).toBe(false);
    expect(isConcentrated("0.02")).toBe(false);
  });

  it("does not flag a leaf whose weight is unknown", () => {
    expect(isConcentrated(null)).toBe(false);
  });
});

describe("toExposureRows", () => {
  it("leaves the long tail out of the rows entirely", () => {
    const rows = toExposureRows(
      [leaf("BIG", "5000"), leaf("SMALL", "10"), leaf("TINY", "5")],
      "10000",
    );
    expect(rows.map((r) => r.key)).toEqual(["COMPANY:BIG"]);
  });

  it("never folds the unresolved leaf, however small", () => {
    const rows = toExposureRows(
      [leaf("BIG", "9999"), leaf("FUND", "1", "UNRESOLVED")],
      "10000",
    );
    expect(rows.map((r) => r.kind)).toContain("UNRESOLVED");
  });

  it("keeps attribution on a real leaf", () => {
    const rows = toExposureRows([leaf("NVDA", "1400", "COMPANY", 3)], "12000");
    expect(rows[0]?.contributions).toHaveLength(3);
    expect(rows[0]?.contributions[0]?.weightInParent).toBeNull();
  });

  it("computes weight against the given total", () => {
    const rows = toExposureRows([leaf("A", "1200")], "12000");
    expect(rows[0]?.weight).toBe("0.100000");
  });

  it("accounts for every euro once the tail is added back", () => {
    const exposures = [
      leaf("A", "5000"),
      leaf("B", "3000"),
      leaf("C", "12"),
      leaf("D", "8"),
      leaf("FUND", "1980", "UNRESOLVED"),
    ];
    const rows = toExposureRows(exposures, "10000");
    const sum = rows.reduce((acc, r) => acc + Number(r.value), 0);
    expect(sum + Number(tailOf(exposures, "10000").value)).toBeCloseTo(
      10000,
      2,
    );
  });

  it("survives a zero total without dividing by it", () => {
    const rows = toExposureRows([leaf("A", "0")], "0");
    expect(rows[0]?.weight).toBeNull();
  });

  it("is empty for no exposures", () => {
    expect(toExposureRows([], "0")).toEqual([]);
  });
});

describe("tailOf", () => {
  it("reports the tail as a fact: how many, how much, what share", () => {
    const tail = tailOf(
      [leaf("BIG", "5000"), leaf("A", "1"), leaf("B", "2")],
      "10000",
    );
    expect(tail).toEqual({ count: 2, value: "3.00", weight: "0.000300" });
  });

  it("does not count the unresolved leaf, which never folds", () => {
    expect(tailOf([leaf("FUND", "1", "UNRESOLVED")], "10000").count).toBe(0);
  });

  it("is empty-safe", () => {
    expect(tailOf([], "0")).toEqual({ count: 0, value: "0.00", weight: null });
  });
});

describe("readingFor", () => {
  const rows = (...leaves: LeafExposure[]) => toExposureRows(leaves, "10000");

  it("reports every leaf analysed, not the handful that fit on screen", () => {
    const reading = readingFor(
      rows(leaf("BIG", "5000"), leaf("SMALL", "1")),
      5029,
    );
    expect(reading?.leafCount).toBe(5029);
  });

  it("names the biggest real leaf and splits it by route", () => {
    const reading = readingFor(rows(leaf("NVDA", "1400", "COMPANY", 2)), 42);
    expect(reading?.name).toBe("NVDA");
    expect(Number(reading?.direct)).toBeGreaterThan(0);
    expect(Number(reading?.via)).toBeGreaterThan(0);
  });

  it("skips the unresolved leaf, which is true but useless as a headline", () => {
    const reading = readingFor(
      rows(leaf("FUND", "9000", "UNRESOLVED"), leaf("REAL", "1000")),
      2,
    );
    expect(reading?.name).toBe("REAL");
  });

  it("flags a leaf over the threshold", () => {
    expect(readingFor(rows(leaf("BIG", "5000")), 1)?.isOver).toBe(true);
    expect(readingFor(rows(leaf("SMALL", "600")), 1)?.isOver).toBe(false);
  });

  it("has nothing to say when there is no real leaf", () => {
    expect(readingFor([], 0)).toBeNull();
    expect(readingFor(rows(leaf("FUND", "9000", "UNRESOLVED")), 1)).toBeNull();
  });
});

describe("parseAllocationView", () => {
  const of = (query: string) => parseAllocationView(new URLSearchParams(query));

  it("reads the view from the URL", () => {
    expect(of("view=rebalance")).toBe("rebalance");
    expect(of("view=currency")).toBe("currency");
    expect(of("view=exposure")).toBe("exposure");
  });

  it("falls back to the reading view for anything else", () => {
    expect(of("")).toBe(DEFAULT_ALLOCATION_VIEW);
    expect(of("view=")).toBe(DEFAULT_ALLOCATION_VIEW);
    expect(of("view=Rebalanceo")).toBe(DEFAULT_ALLOCATION_VIEW);
    expect(of("view=../etc")).toBe(DEFAULT_ALLOCATION_VIEW);
  });
});

describe("viewHref", () => {
  const params = new URLSearchParams(
    "threshold=20&contribution=500.00&drift=3",
  );

  it("keeps every other param, so a tab glance costs no state", () => {
    const href = viewHref(params, "rebalance");
    expect(new URLSearchParams(href).get("threshold")).toBe("20");
    expect(new URLSearchParams(href).get("contribution")).toBe("500.00");
    expect(new URLSearchParams(href).get("drift")).toBe("3");
  });

  it("omits the param for the default view instead of spelling it out", () => {
    expect(viewHref(params, "exposure")).not.toContain("view");
    expect(viewHref(params, "rebalance")).toContain("view=rebalance");
  });

  it("drops a stale view when returning to the default", () => {
    const away = new URLSearchParams(viewHref(params, "rebalance"));
    expect(viewHref(away, "exposure")).not.toContain("view");
  });

  it("leaves the overlap mode behind when leaving the overlap tab", () => {
    const inOverlap = new URLSearchParams("view=overlap&mode=matrix");
    expect(viewHref(inOverlap, "currency")).not.toContain("mode");
    expect(viewHref(inOverlap, "overlap")).toContain("mode=matrix");
  });

  it("leaves the include-sold switch behind when leaving the overlap tab", () => {
    const inOverlap = new URLSearchParams("view=overlap&includeSold=1");
    expect(viewHref(inOverlap, "currency")).not.toContain("includeSold");
    expect(viewHref(inOverlap, "overlap")).toContain("includeSold=1");
  });
});

describe("isCashLine", () => {
  it("recognises a fund's cash buffer stored before the parser folded it", () => {
    expect(isCashLine("JPY", "JPY CASH")).toBe(true);
    expect(isCashLine("usd", "USD CASH")).toBe(true);
  });

  it("strips the venue the parser attached to the stored leaf id", () => {
    expect(isCashLine("JPY.JT", "JPY CASH")).toBe(true);
    expect(isCashLine("GBP.LN", "GBP CASH")).toBe(true);
  });

  it("leaves companies alone, currency-shaped tickers included", () => {
    expect(isCashLine("NOK.LN", "NOKIA OYJ")).toBe(false);
    expect(isCashLine("AAPL", "APPLE INC")).toBe(false);
    expect(isCashLine("SAN.ES", "BANCO SANTANDER")).toBe(false);
    expect(isCashLine("6857", "KEYENCE CORP")).toBe(false);
  });
});

describe("parseOverlapMode", () => {
  const of = (query: string) => parseOverlapMode(new URLSearchParams(query));

  it("reads the mode from the URL and falls back to the list", () => {
    expect(of("mode=matrix")).toBe("matrix");
    expect(of("mode=lista")).toBe("list");
    expect(of("")).toBe(DEFAULT_OVERLAP_MODE);
    expect(of("mode=Matriz")).toBe(DEFAULT_OVERLAP_MODE);
  });
});

describe("modeHref", () => {
  const params = new URLSearchParams("view=overlap&threshold=20");

  it("keeps the tab it belongs to and omits the default mode", () => {
    expect(modeHref(params, "matrix")).toContain("view=overlap");
    expect(modeHref(params, "matrix")).toContain("mode=matrix");
    expect(modeHref(params, "list")).not.toContain("mode");
  });
});

describe("parseIncludeSold", () => {
  const of = (query: string) => parseIncludeSold(new URLSearchParams(query));

  it("is off by default: sold funds stay out of the overlap unless asked for", () => {
    expect(of("")).toBe(false);
    expect(of("includeSold=0")).toBe(false);
    expect(of("includeSold=si")).toBe(false);
  });

  it("turns on only for the exact flag", () => {
    expect(of("includeSold=1")).toBe(true);
  });
});

describe("includeSoldHref", () => {
  const params = new URLSearchParams("view=overlap&threshold=20");

  it("sets the flag on and omits it when off", () => {
    expect(includeSoldHref(params, true)).toContain("includeSold=1");
    expect(includeSoldHref(params, false)).not.toContain("includeSold");
  });

  it("keeps every other param", () => {
    expect(includeSoldHref(params, true)).toContain("view=overlap");
    expect(includeSoldHref(params, true)).toContain("threshold=20");
  });
});

describe("currencyByLeaf", () => {
  const cached = (
    value: string,
    kind: "ISIN" | "TICKER",
    canonicalId: string | null,
    exchCode: string | null = null,
  ): CachedIdentity => ({
    value,
    kind,
    source: "openfigi",
    resolvedAt: new Date("2026-01-01"),
    resolution:
      canonicalId === null
        ? { status: "not-found" }
        : { status: "resolved", canonicalId, exchCode },
  });

  const from = (entries: CachedIdentity[]) =>
    currencyByLeaf(new Map(entries.map((e) => [e.value, e])));

  it("takes the venue the issuer published, with no provider involved", () => {
    const map = from([cached("NVDA.US", "TICKER", "BBG_NVDA")]);
    expect(map.get("COMPANY:BBG_NVDA")).toBe("USD");
  });

  it("answers for a ticker the provider never placed", () => {
    const map = from([cached("IBE.ES", "TICKER", null)]);
    expect(map.get("COMPANY:IBE.ES")).toBe("EUR");
  });

  it("keys the currency by the leaf the projection will use", () => {
    const map = from([cached("US67066G1040", "ISIN", "BBG_NVDA", "US")]);
    expect(map.get("COMPANY:BBG_NVDA")).toBe("USD");
    expect(map.has("COMPANY:US67066G1040")).toBe(false);
  });

  it("merges two identities that reach the same company", () => {
    const map = from([
      cached("US67066G1040", "ISIN", "BBG_NVDA", "US"),
      cached("NVDA.US", "TICKER", "BBG_NVDA"),
    ]);
    expect(map.get("COMPANY:BBG_NVDA")).toBe("USD");
  });

  it("refuses a leaf whose identities disagree on the currency", () => {
    const map = from([
      cached("NVDA.US", "TICKER", "BBG_SAME"),
      cached("NVDA.MX", "TICKER", "BBG_SAME"),
    ]);
    expect(map.has("COMPANY:BBG_SAME")).toBe(false);
  });

  it("says nothing about an ISIN the provider could not place", () => {
    const map = from([cached("IE00B4BNMY34", "ISIN", null)]);
    expect(map.size).toBe(0);
  });

  it("says nothing when an ISIN's listing has no exchange code cached yet", () => {
    const map = from([cached("IE00B4BNMY34", "ISIN", "BBG_ACN", null)]);
    expect(map.size).toBe(0);
  });

  it("ignores a code it cannot translate without losing the ones it can", () => {
    const map = from([
      cached("A00000000001", "ISIN", "BBG_A", "ZZ"),
      cached("B00000000002", "ISIN", "BBG_B", "TT"),
    ]);
    expect(map.has("COMPANY:BBG_A")).toBe(false);
    expect(map.get("COMPANY:BBG_B")).toBe("TWD");
  });

  it("falls back to the confirmed listing for a ticker with no usable venue", () => {
    const map = from([cached("NVDA", "TICKER", "BBG_NVDA", "US")]);
    expect(map.get("COMPANY:BBG_NVDA")).toBe("USD");
  });
});

describe("parseThreshold", () => {
  const of = (value: string) => parseThreshold(`${THRESHOLD_COOKIE}=${value}`);

  it("reads the whole percent from its cookie as a fraction", () => {
    expect(of("20")).toBe("0.2");
    expect(of(String(THRESHOLD_MIN_PERCENT))).toBe("0.05");
    expect(of(String(THRESHOLD_MAX_PERCENT))).toBe("0.3");
  });

  it("finds its cookie among others and ignores a name it only ends with", () => {
    expect(parseThreshold(`quoin-theme=light; ${THRESHOLD_COOKIE}=22`)).toBe(
      "0.22",
    );
    expect(parseThreshold(`x${THRESHOLD_COOKIE}=22`)).toBe(
      CONCENTRATION_THRESHOLD,
    );
  });

  it("falls back to the default, never a clamp, for anything not chosen in settings", () => {
    expect(of("4")).toBe(CONCENTRATION_THRESHOLD);
    expect(of("31")).toBe(CONCENTRATION_THRESHOLD);
    expect(of("12.5")).toBe(CONCENTRATION_THRESHOLD);
    expect(of("-10")).toBe(CONCENTRATION_THRESHOLD);
    expect(of("abc")).toBe(CONCENTRATION_THRESHOLD);
    expect(of("")).toBe(CONCENTRATION_THRESHOLD);
    expect(of("%E0%A4%A")).toBe(CONCENTRATION_THRESHOLD);
    expect(parseThreshold(null)).toBe(CONCENTRATION_THRESHOLD);
  });

  it("round-trips the stored value through the percent helper", () => {
    expect(thresholdPercent(of("22"))).toBe(22);
    expect(thresholdPercent(CONCENTRATION_THRESHOLD)).toBe(15);
  });
});
