import { describe, expect, it } from "vitest";

import { parseHoldingsCsv } from "./parse";
import {
  canonicalRegion,
  countryShare,
  isObsoleteRegion,
  normaliseVenue,
  toCountryCode,
} from "./venue";

const ALL_CODES = Array.from({ length: 26 * 26 }, (_, i) =>
  String.fromCharCode(65 + Math.floor(i / 26), 65 + (i % 26)),
);

describe("toCountryCode", () => {
  it("passes an ISO code straight through", () => {
    expect(toCountryCode("US")).toBe("US");
    expect(toCountryCode("TW")).toBe("TW");
  });

  it("folds the same venue however an issuer spells it", () => {
    expect(toCountryCode("United States")).toBe("US");
    expect(toCountryCode("Estados Unidos")).toBe("US");
    expect(toCountryCode("États-Unis")).toBe("US");
  });

  it("handles the spellings real files use", () => {
    expect(toCountryCode("Japan")).toBe("JP");
    expect(toCountryCode("South Korea")).toBe("KR");
    expect(toCountryCode("Switzerland")).toBe("CH");
    expect(toCountryCode("Taiwan")).toBe("TW");
  });

  it("ignores case, accents and punctuation", () => {
    expect(toCountryCode("  united states ")).toBe("US");
    expect(toCountryCode("ESTADOS UNIDOS")).toBe("US");
  });

  it("returns null for an exchange, which is not a country", () => {
    expect(toCountryCode("NASDAQ")).toBeNull();
    expect(toCountryCode("New York Stock Exchange Inc.")).toBeNull();
    expect(toCountryCode("")).toBeNull();
  });
});

describe("canonicalRegion", () => {
  it("rewrites exactly these retired codes", () => {
    const rewrites = ALL_CODES.filter((c) => canonicalRegion(c) !== c).map(
      (c) => `${c}>${canonicalRegion(c)}`,
    );
    expect(rewrites).toEqual([
      "AN>CW",
      "BU>MM",
      "CS>RS",
      "CT>KI",
      "DD>DE",
      "DY>BJ",
      "FQ>AQ",
      "FX>FR",
      "HV>BF",
      "JT>UM",
      "MI>UM",
      "NH>VU",
      "NQ>AQ",
      "NT>SA",
      "PC>FM",
      "PU>UM",
      "PZ>PA",
      "QU>EU",
      "RH>ZW",
      "SU>RU",
      "TP>TL",
      "UK>GB",
      "VD>VN",
      "WK>UM",
      "YD>YE",
      "YU>RS",
      "ZR>CD",
    ]);
  });
});

describe("retired country codes", () => {
  const byName: [string, string, string][] = [
    ["France", "Francia", "FR"],
    ["United Kingdom", "Reino Unido", "GB"],
    ["Russia", "Rusia", "RU"],
    ["Serbia", "Serbien", "RS"],
    ["Congo - Kinshasa", "República Democrática del Congo", "CD"],
    ["Burkina Faso", "Burkina Faso", "BF"],
    ["Benin", "Benín", "BJ"],
    ["Timor-Leste", "Timor Oriental", "TL"],
  ];

  it.each(byName)("folds %s and %s to %s", (first, second, code) => {
    expect(toCountryCode(first)).toBe(code);
    expect(toCountryCode(second)).toBe(code);
  });

  it("rewrites a retired code an issuer writes directly", () => {
    expect(toCountryCode("UK")).toBe("GB");
    expect(toCountryCode("FX")).toBe("FR");
  });

  it("rewrites only the retired codes some locale names", () => {
    expect(ALL_CODES.filter(isObsoleteRegion)).toEqual([
      "AN",
      "BU",
      "CS",
      "DD",
      "DY",
      "FX",
      "HV",
      "NH",
      "RH",
      "SU",
      "TP",
      "UK",
      "VD",
      "YD",
      "YU",
      "ZR",
    ]);
  });

  it("leaves Bloomberg exchange codes that are retired but unnamed", () => {
    expect(toCountryCode("CT")).toBe("CT");
    expect(toCountryCode("JT")).toBe("JT");
    expect(isObsoleteRegion("CT")).toBe(false);
  });

  it("leaves current codes alone", () => {
    expect(toCountryCode("DE")).toBe("DE");
    expect(toCountryCode("US")).toBe("US");
    expect(isObsoleteRegion("FR")).toBe(false);
  });

  it("gives the same key whether the issuer writes France or FR", () => {
    const csv = (country: string) =>
      [
        "Ticker,Name,Weight,Location",
        `SAN,Alpha SA,20,${country}`,
        "SAN,Beta SA,10,Spain",
        "MRK,Gamma Inc,30,United States",
        "MRK,Delta AG,5,Germany",
        "ARRY,Epsilon Inc,25,United States",
        "ARRY,Epsilon Inc,10,United States",
      ].join("\n");
    const keys = (country: string) =>
      parseHoldingsCsv(csv(country)).holdings.map((h) => h.identity);

    expect(keys("France")).toEqual(keys("FR"));
    expect(keys("France")).toContain("SAN.FR");
  });
});

describe("normaliseVenue", () => {
  it("keeps what it cannot normalise rather than dropping it", () => {
    expect(normaliseVenue("NASDAQ")).toBe("NASDAQ");
    expect(normaliseVenue("Tokyo Stock Exchange")).toBe("Tokyo Stock Exchange");
  });

  it("normalises what it can", () => {
    expect(normaliseVenue("United States")).toBe("US");
  });
});

describe("countryShare", () => {
  it("scores a column of countries high and one of exchanges low", () => {
    expect(countryShare(["United States", "Japan", "Taiwan"])).toBe(1);
    expect(countryShare(["NASDAQ", "Xetra", "SIX Swiss Exchange"])).toBe(0);
  });

  it("ignores blanks rather than counting them against a column", () => {
    expect(countryShare(["US", "", "  ", "JP"])).toBe(1);
  });

  it("is zero for nothing", () => {
    expect(countryShare([])).toBe(0);
    expect(countryShare(["", " "])).toBe(0);
  });
});
