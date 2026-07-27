import { describe, expect, it } from "vitest";

import { countryShare, normaliseVenue, toCountryCode } from "./venue";

describe("toCountryCode", () => {
  it("passes an ISO code straight through", () => {
    expect(toCountryCode("US")).toBe("US");
    expect(toCountryCode("TW")).toBe("TW");
  });

  it("folds the same venue however an issuer spells it", () => {
    // The whole point: one issuer writes "US", another "United States", and a
    // third could write "Estados Unidos". Left alone that is three leaves for
    // one listing — collisions the parser invented rather than found.
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
    // Guessing at these would merge venues that are genuinely different.
    expect(toCountryCode("NASDAQ")).toBeNull();
    expect(toCountryCode("New York Stock Exchange Inc.")).toBeNull();
    expect(toCountryCode("")).toBeNull();
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
    // This is what makes the parser prefer Location over Exchange: countries
    // fold across issuers and languages, exchange names never will.
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
