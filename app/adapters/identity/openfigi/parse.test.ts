import { describe, expect, it } from "vitest";

import type { RawIdentity } from "~/core/ports";

import {
  bareTicker,
  batch,
  canonicalFrom,
  isinCountry,
  parseMappingResponse,
  primaryExchCode,
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
    expect(bareTicker("BRK.B.US")).toBe("BRK.B");
  });

  it("leaves an unqualified ticker alone", () => {
    expect(bareTicker("NVDA")).toBe("NVDA");
  });
});

describe("toMappingJobs", () => {
  it("asks by ISIN when the issuer published one", () => {
    expect(toMappingJobs([isin("US00TEST0041")])).toEqual([
      { idType: "ID_ISIN", idValue: "US00TEST0041" },
    ]);
  });

  it("asks by bare ticker, with no exchange code", () => {
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
    expect(canonicalFrom({ data: [match("BBG001S5S399")] })).toEqual({
      status: "resolved",
      canonicalId: "BBG001S5S399",
      exchCode: null,
    });
  });

  it("resolves when several listings agree", () => {
    const result: MappingResult = {
      data: [
        match("BBG001S5S399"),
        match("BBG001S5S399"),
        match("BBG001S5S399"),
      ],
    };
    expect(canonicalFrom(result)).toEqual({
      status: "resolved",
      canonicalId: "BBG001S5S399",
      exchCode: null,
    });
  });

  it("refuses when listings disagree, rather than picking one", () => {
    const result: MappingResult = {
      data: [
        match("BBG001S5S399", "SANTANDER"),
        match("BBG001SDDDD1", "SANOFI"),
      ],
    };
    expect(canonicalFrom(result)).toEqual({
      status: "ambiguous",
      candidates: 2,
    });
  });

  it("treats the v3 warning key as a miss", () => {
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
    expect(canonicalFrom({ data: [match(null)] })).toEqual({
      status: "not-found",
    });
  });

  it("misses on an empty or absent payload", () => {
    expect(canonicalFrom({ data: [] })).toEqual({ status: "not-found" });
    expect(canonicalFrom(undefined)).toEqual({ status: "not-found" });
    expect(canonicalFrom({})).toEqual({ status: "not-found" });
  });

  it("ignores blank share-class values rather than treating them as an id", () => {
    expect(canonicalFrom({ data: [match(""), match("BBG001S5S399")] })).toEqual(
      {
        status: "resolved",
        canonicalId: "BBG001S5S399",
        exchCode: null,
      },
    );
  });
});

describe("parseMappingResponse", () => {
  it("zips results back onto the identities positionally", () => {
    const identities = [
      isin("US00TEST0041"),
      ticker("NVDA.US"),
      ticker("SAN.ES"),
    ];
    const results: MappingResult[] = [
      { data: [match("BBG001S5S399")] },
      { data: [match("BBG001S5S399")] },
      { data: [match("BBG0A"), match("BBG0B")] },
    ];

    const resolved = parseMappingResponse(identities, results);
    expect(resolved.get("US00TEST0041")).toEqual(resolved.get("NVDA.US"));
    expect(resolved.get("SAN.ES")).toEqual({
      status: "ambiguous",
      candidates: 2,
    });
  });

  it("marks identities the response never covered as misses", () => {
    const resolved = parseMappingResponse(
      [isin("A0000000001"), isin("B0000000002")],
      [{ data: [match("BBG001S5S399")] }],
    );
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
    expect(
      canonicalFrom({ data: [santander, sanofi] }, "Banco Santander SA"),
    ).toEqual({
      status: "resolved",
      canonicalId: "BBG_SAN",
      exchCode: null,
    });
    expect(canonicalFrom({ data: [santander, sanofi] }, "Sanofi")).toEqual({
      status: "resolved",
      canonicalId: "BBG_SNY",
      exchCode: null,
    });
  });

  it("ignores legal form, case and punctuation", () => {
    expect(
      canonicalFrom({ data: [santander, sanofi] }, "banco santander, s.a."),
    ).toEqual({ status: "resolved", canonicalId: "BBG_SAN", exchCode: null });
  });

  it("stays ambiguous when the name matches nothing", () => {
    expect(
      canonicalFrom({ data: [santander, sanofi] }, "Some Other Company"),
    ).toEqual({
      status: "ambiguous",
      candidates: 2,
    });
  });

  it("stays ambiguous when the name matches two different share classes", () => {
    const a = { shareClassFIGI: "BBG_GOOG", name: "Alphabet Inc" };
    const b = { shareClassFIGI: "BBG_GOOGL", name: "Alphabet Inc" };
    expect(canonicalFrom({ data: [a, b] }, "Alphabet Inc")).toEqual({
      status: "ambiguous",
      candidates: 2,
    });
  });

  it("needs no name when the candidates already agree", () => {
    expect(
      canonicalFrom({ data: [match("BBG001S5S399"), match("BBG001S5S399")] }),
    ).toEqual({
      status: "resolved",
      canonicalId: "BBG001S5S399",
      exchCode: null,
    });
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
  const other = {
    shareClassFIGI: "BBG_OTHER",
    name: "SOME OTHER CO",
    exchCode: "US",
  };

  it("uses the venue, which is structured data rather than prose", () => {
    expect(canonicalFrom({ data: [tsmc, other] }, undefined, "TW")).toEqual({
      status: "resolved",
      canonicalId: "BBG_TSMC",
      exchCode: "TT",
    });
  });

  it("prefers the venue over the name when both could decide", () => {
    expect(
      canonicalFrom({ data: [tsmc, other] }, "SOME OTHER CO", "TW"),
    ).toEqual({
      status: "resolved",
      canonicalId: "BBG_TSMC",
      exchCode: "TT",
    });
  });

  it("falls through to the name for a venue with no Bloomberg code", () => {
    expect(
      canonicalFrom({ data: [tsmc, other] }, "Some Other Co", "ZZ"),
    ).toEqual({
      status: "resolved",
      canonicalId: "BBG_OTHER",
      exchCode: "US",
    });
  });

  it("falls through when the venue matches several share classes", () => {
    const a = { shareClassFIGI: "BBG_A", name: "ALPHA CORP", exchCode: "US" };
    const b = { shareClassFIGI: "BBG_B", name: "BETA CORP", exchCode: "US" };
    expect(canonicalFrom({ data: [a, b] }, "Beta Corp", "US")).toEqual({
      status: "resolved",
      canonicalId: "BBG_B",
      exchCode: "US",
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
    const tsmc = {
      shareClassFIGI: "BBG_TSMC",
      name: "TAIWAN SEMICONDUCTOR MANUFACT",
    };
    const other = { shareClassFIGI: "BBG_OTHER", name: "UNRELATED HOLDINGS" };
    expect(
      canonicalFrom(
        { data: [tsmc, other] },
        "Taiwan Semiconductor Manufacturing Co Ltd",
      ),
    ).toEqual({ status: "resolved", canonicalId: "BBG_TSMC", exchCode: null });
  });

  it("refuses when a prefix fits more than one candidate", () => {
    const a = { shareClassFIGI: "BBG_A", name: "NATIONAL BANK" };
    const b = { shareClassFIGI: "BBG_B", name: "NATIONAL BANK OF GREECE" };
    expect(
      canonicalFrom({ data: [a, b] }, "National Bank of Greece SA"),
    ).toEqual({
      status: "ambiguous",
      candidates: 2,
    });
  });
});

describe("isinCountry", () => {
  it("reads the country an ISIN is registered in", () => {
    expect(isinCountry("US00TEST0041")).toBe("US");
    expect(isinCountry("IE00TEST0042")).toBe("IE");
  });

  it("has nothing to say about a ticker", () => {
    expect(isinCountry("NVDA.US")).toBeNull();
    expect(isinCountry("6526")).toBeNull();
    expect(isinCountry("")).toBeNull();
  });
});

describe("primaryExchCode — where a share class does business", () => {
  const composite = (
    figi: string,
    exchCode: string,
    shareClassFIGI = "BBG_SC",
  ) => ({ figi, compositeFIGI: figi, shareClassFIGI, exchCode });

  const venue = (
    figi: string,
    compositeFIGI: string,
    exchCode: string,
    shareClassFIGI = "BBG_SC",
  ) => ({ figi, compositeFIGI, shareClassFIGI, exchCode });

  it("takes the only composite when there is only one", () => {
    const rows = [
      composite("BBG_C", "US"),
      venue("BBG_V1", "BBG_C", "UN"),
      venue("BBG_V2", "BBG_C", "UW"),
    ];
    expect(primaryExchCode(rows, "BBG_SC")).toBe("US");
  });

  it("confirms the registered country against the composites, for a cross-listed name", () => {
    const nvidia = [
      composite("BBG_US", "US"),
      composite("BBG_DE", "GR"),
      composite("BBG_MX", "MM"),
      composite("BBG_CH", "SW"),
      composite("BBG_MTF", "EO"),
      venue("BBG_V", "BBG_US", "UW"),
    ];
    expect(primaryExchCode(nvidia, "BBG_SC", "US")).toBe("US");
  });

  it("refuses when nothing confirms the registered country", () => {
    const accenture = [
      composite("BBG_DE", "GR"),
      composite("BBG_US", "US"),
      composite("BBG_MX", "MM"),
      composite("BBG_MTF", "EO"),
    ];
    expect(primaryExchCode(accenture, "BBG_SC", "IE")).toBeNull();
  });

  it("confirms against a venue row when the country's composite is absent", () => {
    const asml = [
      composite("BBG_DE", "GR"),
      composite("BBG_US", "US"),
      composite("BBG_MTF", "EO"),
      venue("BBG_AMS", "BBG_NEVER_RETURNED", "NA"),
    ];
    expect(primaryExchCode(asml, "BBG_SC", "NL")).toBe("NA");
  });

  it("refuses a cross-listed name with no country to confirm against", () => {
    const rows = [composite("BBG_US", "US"), composite("BBG_DE", "GR")];
    expect(primaryExchCode(rows, "BBG_SC")).toBeNull();
    expect(primaryExchCode(rows, "BBG_SC", null)).toBeNull();
    expect(primaryExchCode(rows, "BBG_SC", "ZZ")).toBeNull();
  });

  it("ignores the composites of other share classes in the same answer", () => {
    const rows = [
      composite("BBG_A", "TT", "BBG_SC_A"),
      composite("BBG_B", "US", "BBG_SC_B"),
      composite("BBG_C", "GR", "BBG_SC_B"),
    ];
    expect(primaryExchCode(rows, "BBG_SC_A")).toBe("TT");
  });

  it("falls back to unanimity when no row marks itself composite", () => {
    const a = { shareClassFIGI: "BBG_SC", exchCode: "TT" };
    const b = { shareClassFIGI: "BBG_SC", exchCode: "TT" };
    expect(primaryExchCode([a, b], "BBG_SC")).toBe("TT");

    const c = { shareClassFIGI: "BBG_SC", exchCode: "US" };
    expect(primaryExchCode([a, c], "BBG_SC")).toBeNull();
  });

  it("has nothing to say when no listing carries an exchange code", () => {
    expect(
      primaryExchCode([{ shareClassFIGI: "BBG_SC" }], "BBG_SC"),
    ).toBeNull();
    expect(
      primaryExchCode([{ shareClassFIGI: "BBG_SC", exchCode: "" }], "BBG_SC"),
    ).toBeNull();
  });
});

describe("canonicalFrom — the currency of business it carries", () => {
  it("confirms an ISIN's country without letting it decide the canonical id", () => {
    const rows = [
      {
        figi: "BBG_US",
        compositeFIGI: "BBG_US",
        shareClassFIGI: "BBG_SC",
        exchCode: "US",
      },
      {
        figi: "BBG_DE",
        compositeFIGI: "BBG_DE",
        shareClassFIGI: "BBG_SC",
        exchCode: "GR",
      },
    ];

    const [resolution] = [
      ...parseMappingResponse(
        [isin("US00TEST0041")],
        [{ data: rows }],
      ).values(),
    ];
    expect(resolution).toEqual({
      status: "resolved",
      canonicalId: "BBG_SC",
      exchCode: "US",
    });
  });

  it("refuses the currency when the ISIN's country is not among the listings", () => {
    const rows = [
      {
        figi: "BBG_US",
        compositeFIGI: "BBG_US",
        shareClassFIGI: "BBG_SC",
        exchCode: "US",
      },
      {
        figi: "BBG_DE",
        compositeFIGI: "BBG_DE",
        shareClassFIGI: "BBG_SC",
        exchCode: "GR",
      },
    ];

    const [resolution] = [
      ...parseMappingResponse(
        [isin("IE00TEST0042")],
        [{ data: rows }],
      ).values(),
    ];
    expect(resolution).toEqual({
      status: "resolved",
      canonicalId: "BBG_SC",
      exchCode: null,
    });
  });
});
