import { describe, expect, it } from "vitest";

import type { RawIdentity } from "~/core/ports";

import {
  bareTicker,
  batch,
  canonicalFrom,
  parseMappingResponse,
  toMappingJobs,
  type MappingResult,
} from "./parse";

const isin = (value: string): RawIdentity => ({ value, kind: "ISIN" });
const ticker = (value: string): RawIdentity => ({ value, kind: "TICKER" });

const match = (shareClassFIGI: string | null, name = "ACME") => ({
  figi: "BBG000000001",
  shareClassFIGI,
  compositeFIGI: "BBG000000002",
  name,
});

describe("bareTicker", () => {
  it("drops the venue the holdings parser appended", () => {
    expect(bareTicker("NVDA.US")).toBe("NVDA");
    expect(bareTicker("6526.JP")).toBe("6526");
  });

  it("keeps a ticker that carries its own dot", () => {
    // BRK/B and friends aside, some tickers really are "X.Y" shaped; only the
    // LAST segment is the venue this parser added.
    expect(bareTicker("BRK.B.US")).toBe("BRK.B");
  });

  it("leaves an unqualified ticker alone", () => {
    expect(bareTicker("NVDA")).toBe("NVDA");
  });
});

describe("toMappingJobs", () => {
  it("asks by ISIN when the issuer published one", () => {
    expect(toMappingJobs([isin("US67066G1040")])).toEqual([
      { idType: "ID_ISIN", idValue: "US67066G1040" },
    ]);
  });

  it("asks by bare ticker, with no exchange code", () => {
    // OpenFIGI's exchange vocabulary is Bloomberg's, not ISO — Germany is GR,
    // the UK is LN — so passing the ISO codes we hold would need a table to
    // maintain. Ambiguity is handled by refusing, not by guessing a venue.
    expect(toMappingJobs([ticker("NVDA.US")])).toEqual([
      { idType: "TICKER", idValue: "NVDA" },
    ]);
  });

  it("preserves order, since results come back positionally", () => {
    const jobs = toMappingJobs([isin("US0000000001"), ticker("AAA.US")]);
    expect(jobs.map((j) => j.idType)).toEqual(["ID_ISIN", "TICKER"]);
  });
});

describe("canonicalFrom", () => {
  it("uses the share-class FIGI, which links the same class across countries", () => {
    // This is the level that closes the ISIN-versus-ticker gap: composite would
    // only link venues within one country and leave it open.
    expect(canonicalFrom({ data: [match("BBG001S5S399")] })).toEqual({
      status: "resolved",
      canonicalId: "BBG001S5S399",
    });
  });

  it("resolves when several listings agree", () => {
    const result: MappingResult = {
      data: [match("BBG001S5S399"), match("BBG001S5S399"), match("BBG001S5S399")],
    };
    expect(canonicalFrom(result)).toEqual({
      status: "resolved",
      canonicalId: "BBG001S5S399",
    });
  });

  it("refuses when listings disagree, rather than picking one", () => {
    // SAN is Banco Santander in Madrid and Sanofi in Paris. Choosing either
    // would claim a holding that does not exist.
    const result: MappingResult = {
      data: [match("BBG001S5S399", "SANTANDER"), match("BBG001SDDDD1", "SANOFI")],
    };
    expect(canonicalFrom(result)).toEqual({ status: "ambiguous", candidates: 2 });
  });

  it("treats the v3 warning key as a miss", () => {
    // v3 renamed this from `error`; code that only checks the old key swallows
    // every miss in silence.
    expect(canonicalFrom({ warning: "No identifier found." })).toEqual({
      status: "not-found",
    });
  });

  it("still treats the v2 error key as a miss", () => {
    expect(canonicalFrom({ error: "No identifier found." })).toEqual({
      status: "not-found",
    });
  });

  it("misses when a match carries no share-class FIGI", () => {
    // Bonds and government paper come back with shareClassFIGI null. They are
    // not equities, so there is nothing to merge.
    expect(canonicalFrom({ data: [match(null)] })).toEqual({ status: "not-found" });
  });

  it("misses on an empty or absent payload", () => {
    expect(canonicalFrom({ data: [] })).toEqual({ status: "not-found" });
    expect(canonicalFrom(undefined)).toEqual({ status: "not-found" });
    expect(canonicalFrom({})).toEqual({ status: "not-found" });
  });

  it("ignores blank share-class values rather than treating them as an id", () => {
    expect(canonicalFrom({ data: [match(""), match("BBG001S5S399")] })).toEqual({
      status: "resolved",
      canonicalId: "BBG001S5S399",
    });
  });
});

describe("parseMappingResponse", () => {
  it("zips results back onto the identities positionally", () => {
    const identities = [isin("US67066G1040"), ticker("NVDA.US"), ticker("SAN.ES")];
    const results: MappingResult[] = [
      { data: [match("BBG001S5S399")] },
      { data: [match("BBG001S5S399")] },
      { data: [match("BBG0A"), match("BBG0B")] },
    ];

    const resolved = parseMappingResponse(identities, results);
    // The whole point: an ISIN and a ticker arriving at the same canonical id.
    expect(resolved.get("US67066G1040")).toEqual(resolved.get("NVDA.US"));
    expect(resolved.get("SAN.ES")).toEqual({ status: "ambiguous", candidates: 2 });
  });

  it("marks identities the response never covered as misses", () => {
    // A short response must not silently shift results onto the wrong identity.
    const resolved = parseMappingResponse([isin("A0000000001"), isin("B0000000002")], [
      { data: [match("BBG001S5S399")] },
    ]);
    expect(resolved.get("B0000000002")).toEqual({ status: "not-found" });
  });

  it("covers every identity it was given", () => {
    const identities = [isin("A0000000001"), ticker("B.US"), ticker("C.JP")];
    expect(parseMappingResponse(identities, []).size).toBe(3);
  });
});

describe("batch", () => {
  it("splits to the request limit", () => {
    expect(batch([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("keeps order, which is what makes weight-priority work", () => {
    // Callers pass the heaviest leaves first so the rows on screen resolve in
    // the first requests, even when an unauthenticated caller has to spend
    // twenty minutes on the tail.
    expect(batch([1, 2, 3, 4], 10)).toEqual([[1, 2, 3, 4]]);
  });

  it("is empty for nothing", () => {
    expect(batch([], 10)).toEqual([]);
  });
});

describe("canonicalFrom — narrowing a ticker with the issuer's own name", () => {
  const santander = { shareClassFIGI: "BBG_SAN", name: "BANCO SANTANDER SA" };
  const sanofi = { shareClassFIGI: "BBG_SNY", name: "SANOFI SA" };

  it("picks the candidate the file meant", () => {
    // Not the leaf-to-leaf name matching that was rejected: Bloomberg has
    // already bounded the candidate set to the companies sharing this ticker,
    // and the only question left is which of those two this row is.
    expect(canonicalFrom({ data: [santander, sanofi] }, "Banco Santander SA")).toEqual({
      status: "resolved",
      canonicalId: "BBG_SAN",
    });
    // And the other way round, from the same candidate set.
    expect(canonicalFrom({ data: [santander, sanofi] }, "Sanofi")).toEqual({
      status: "resolved",
      canonicalId: "BBG_SNY",
    });
  });

  it("ignores legal form, case and punctuation", () => {
    expect(
      canonicalFrom({ data: [santander, sanofi] }, "banco santander, s.a."),
    ).toEqual({ status: "resolved", canonicalId: "BBG_SAN" });
  });

  it("stays ambiguous when the name matches nothing", () => {
    // Refusing is the safe failure: the leaf keeps its raw identity and still
    // shows the right value, it just does not merge.
    expect(canonicalFrom({ data: [santander, sanofi] }, "Some Other Company")).toEqual({
      status: "ambiguous",
      candidates: 2,
    });
  });

  it("stays ambiguous when the name matches two different share classes", () => {
    // GOOG and GOOGL are both "Alphabet Inc". They are separate securities with
    // separate ISINs and prices, so refusing to merge them is correct.
    const a = { shareClassFIGI: "BBG_GOOG", name: "Alphabet Inc" };
    const b = { shareClassFIGI: "BBG_GOOGL", name: "Alphabet Inc" };
    expect(canonicalFrom({ data: [a, b] }, "Alphabet Inc")).toEqual({
      status: "ambiguous",
      candidates: 2,
    });
  });

  it("needs no name when the candidates already agree", () => {
    expect(canonicalFrom({ data: [match("BBG001S5S399"), match("BBG001S5S399")] })).toEqual(
      { status: "resolved", canonicalId: "BBG001S5S399" },
    );
  });

  it("stays ambiguous when no name was supplied", () => {
    expect(canonicalFrom({ data: [santander, sanofi] })).toEqual({
      status: "ambiguous",
      candidates: 2,
    });
  });
});

describe("canonicalFrom — narrowing by where the holding trades", () => {
  const tsmc = {
    shareClassFIGI: "BBG_TSMC",
    name: "TAIWAN SEMICONDUCTOR MANUFACT",
    exchCode: "TT",
  };
  const other = { shareClassFIGI: "BBG_OTHER", name: "SOME OTHER CO", exchCode: "US" };

  it("uses the venue, which is structured data rather than prose", () => {
    // 2330 is TSMC in Taipei and something else elsewhere. Numeric tickers are
    // normal across Asia and collide constantly.
    expect(canonicalFrom({ data: [tsmc, other] }, undefined, "TW")).toEqual({
      status: "resolved",
      canonicalId: "BBG_TSMC",
    });
  });

  it("prefers the venue over the name when both could decide", () => {
    expect(canonicalFrom({ data: [tsmc, other] }, "SOME OTHER CO", "TW")).toEqual({
      status: "resolved",
      canonicalId: "BBG_TSMC",
    });
  });

  it("falls through to the name for a venue with no Bloomberg code", () => {
    // An unmapped country filters nothing, so this degrades to what it did
    // before rather than failing.
    expect(canonicalFrom({ data: [tsmc, other] }, "Some Other Co", "ZZ")).toEqual({
      status: "resolved",
      canonicalId: "BBG_OTHER",
    });
  });

  it("falls through when the venue matches several share classes", () => {
    const a = { shareClassFIGI: "BBG_A", name: "ALPHA CORP", exchCode: "US" };
    const b = { shareClassFIGI: "BBG_B", name: "BETA CORP", exchCode: "US" };
    expect(canonicalFrom({ data: [a, b] }, "Beta Corp", "US")).toEqual({
      status: "resolved",
      canonicalId: "BBG_B",
    });
  });

  it("still refuses when neither signal decides", () => {
    const a = { shareClassFIGI: "BBG_A", name: "ALPHA CORP", exchCode: "US" };
    const b = { shareClassFIGI: "BBG_B", name: "BETA CORP", exchCode: "US" };
    expect(canonicalFrom({ data: [a, b] }, "Gamma Corp", "US")).toEqual({
      status: "ambiguous",
      candidates: 2,
    });
  });
});

describe("canonicalFrom — names truncated at different widths", () => {
  it("matches a clipped provider name against a full issuer name", () => {
    // The real failure this fixes: TSMC arrived from one issuer as an ISIN and
    // from another as ticker 2330, and the provider's clipped name meant the
    // two never met.
    const tsmc = { shareClassFIGI: "BBG_TSMC", name: "TAIWAN SEMICONDUCTOR MANUFACT" };
    const other = { shareClassFIGI: "BBG_OTHER", name: "UNRELATED HOLDINGS" };
    expect(
      canonicalFrom({ data: [tsmc, other] }, "Taiwan Semiconductor Manufacturing Co Ltd"),
    ).toEqual({ status: "resolved", canonicalId: "BBG_TSMC" });
  });

  it("refuses when a prefix fits more than one candidate", () => {
    // Containment is looser than equality, so it is only safe while the match
    // has to be unique.
    const a = { shareClassFIGI: "BBG_A", name: "NATIONAL BANK" };
    const b = { shareClassFIGI: "BBG_B", name: "NATIONAL BANK OF GREECE" };
    expect(canonicalFrom({ data: [a, b] }, "National Bank of Greece SA")).toEqual({
      status: "ambiguous",
      candidates: 2,
    });
  });
});
