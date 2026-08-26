import { describe, expect, it } from "vitest";

import {
  looksLikeCashRow,
  looksLikeIsin,
  looksLikeTicker,
  parseLooseNumber,
} from "./numbers";

const n = (raw: string): string | null =>
  parseLooseNumber(raw)?.toString() ?? null;

describe("parseLooseNumber", () => {
  it("reads a dot decimal with a percent sign", () => {
    expect(n("4.4503%")).toBe("4.4503");
  });

  it("reads a comma decimal with a leading space", () => {
    expect(n(" 15,51%")).toBe("15.51");
  });

  it("reads a bare number with no percent sign", () => {
    expect(n("12.52")).toBe("12.52");
  });

  it("keeps a sign separated from its digits by a space", () => {
    expect(n("- 0,02%")).toBe("-0.02");
    expect(n("+ 1,5")).toBe("1.5");
  });

  it("strips a U+2019 thousands separator", () => {
    expect(n("174’598’847")).toBe("174598847");
  });

  it("strips currency symbols and non-breaking spaces", () => {
    expect(n("1\u00a0234,50 €")).toBe("1234.5");
  });

  it("handles a separator doing both jobs in the same number", () => {
    expect(parseLooseNumber("$ 322.235.420.00")?.toFixed(2)).toBe(
      "322235420.00",
    );
  });

  it("treats the rightmost separator as the decimal point", () => {
    expect(n("1.234,56")).toBe("1234.56");
    expect(n("1,234.56")).toBe("1234.56");
  });

  it("treats repeated separators as grouping, never as decimals", () => {
    expect(n("322.235.420")).toBe("322235420");
    expect(n("1,234,567")).toBe("1234567");
  });

  it("reads a lone comma as a decimal point", () => {
    expect(n("15,51")).toBe("15.51");
  });

  it("returns null for anything without digits", () => {
    expect(n("")).toBeNull();
    expect(n("--")).toBeNull();
    expect(n("N/A")).toBeNull();
    expect(n("Cash")).toBeNull();
  });

  it("does not mistake a quoted value for text", () => {
    expect(n('"3,29"')).toBe("3.29");
  });
});

describe("looksLikeIsin", () => {
  it("accepts a well-formed ISIN", () => {
    expect(looksLikeIsin("IE00TEST0001")).toBe(true);
    expect(looksLikeIsin("US00TEST0002")).toBe(true);
    expect(looksLikeIsin("XS00TEST0003")).toBe(true);
  });

  it("rejects near misses", () => {
    expect(looksLikeIsin("NVDA")).toBe(false);
    expect(looksLikeIsin("IE00TEST000")).toBe(false); // too short
    expect(looksLikeIsin("1E00TEST0001")).toBe(false); // digits for the country
    expect(looksLikeIsin("--")).toBe(false);
  });
});

describe("looksLikeTicker", () => {
  it("accepts the shapes issuers actually publish", () => {
    expect(looksLikeTicker("NVDA")).toBe(true);
    expect(looksLikeTicker("6857")).toBe(true); // Tokyo lists Keyence numerically
    expect(looksLikeTicker("HEXA B")).toBe(true); // Nordic share class
    expect(looksLikeTicker("BRK.B")).toBe(true);
    expect(looksLikeTicker("U-U CN")).toBe(true);
  });

  it("rejects prose", () => {
    expect(looksLikeTicker("United States")).toBe(false);
    expect(looksLikeTicker("NVIDIA Corp")).toBe(false);
    expect(looksLikeTicker("")).toBe(false);
  });
});

describe("looksLikeCashRow", () => {
  it("catches a cash buffer however the issuer words it", () => {
    expect(looksLikeCashRow("JPY", "JPY CASH")).toBe(true);
    expect(looksLikeCashRow("USD", "USD CASH")).toBe(true);
    expect(looksLikeCashRow("usd", "Cash USD")).toBe(true);
    expect(looksLikeCashRow("USD", "EFECTIVO USD")).toBe(true); // no English
    expect(looksLikeCashRow("CHF", "CHF CASH COLLATERAL")).toBe(true);
  });

  it("keeps a company whose ticker is also a currency code", () => {
    expect(looksLikeCashRow("NOK", "NOKIA OYJ")).toBe(false);
    expect(looksLikeCashRow("SEK", "SEKISUI HOUSE LTD")).toBe(false);
  });

  it("ignores anything that is not a currency code at all", () => {
    expect(looksLikeCashRow("AAPL", "APPLE INC")).toBe(false);
    expect(looksLikeCashRow("", "")).toBe(false);
    expect(looksLikeCashRow("XYZ", "XYZ CASH")).toBe(false); // not ISO 4217
  });
});
