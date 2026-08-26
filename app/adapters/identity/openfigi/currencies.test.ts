import { describe, expect, it } from "vitest";

import { bloombergCurrency } from "./currencies";
import { toExchangeCode } from "./venues";

describe("bloombergCurrency", () => {
  it("reads the composite codes of the venues that appear in real holdings", () => {
    expect(bloombergCurrency("US")).toBe("USD");
    expect(bloombergCurrency("GR")).toBe("EUR");
    expect(bloombergCurrency("LN")).toBe("GBP");
    expect(bloombergCurrency("TT")).toBe("TWD");
    expect(bloombergCurrency("JT")).toBe("JPY");
    expect(bloombergCurrency("SW")).toBe("CHF");
  });

  it("keeps Israel and Italy apart", () => {
    expect(bloombergCurrency("IT")).toBe("ILS"); // Israel
    expect(bloombergCurrency("IM")).toBe("EUR"); // Italy
  });

  it("keeps Ireland and Indonesia apart", () => {
    expect(bloombergCurrency("ID")).toBe("EUR"); // Ireland
    expect(bloombergCurrency("IJ")).toBe("IDR"); // Indonesia
  });

  it("keeps China and Switzerland apart", () => {
    expect(bloombergCurrency("CH")).toBe("CNY"); // China
    expect(bloombergCurrency("SW")).toBe("CHF"); // Switzerland
  });

  it("refuses an unlisted code rather than guessing", () => {
    expect(bloombergCurrency("UN")).toBeNull();
    expect(bloombergCurrency("ZZ")).toBeNull();
    expect(bloombergCurrency(null)).toBeNull();
    expect(bloombergCurrency("")).toBeNull();
  });

  it("covers every venue the identity resolver can narrow by", () => {
    const isoCodes = [
      "US",
      "CA",
      "GB",
      "DE",
      "FR",
      "ES",
      "IT",
      "NL",
      "BE",
      "PT",
      "AT",
      "IE",
      "CH",
      "SE",
      "NO",
      "DK",
      "FI",
      "JP",
      "HK",
      "TW",
      "KR",
      "SG",
      "AU",
      "NZ",
      "IN",
      "CN",
      "TH",
      "MY",
      "ID",
      "PH",
      "BR",
      "MX",
      "ZA",
      "TR",
      "PL",
      "IL",
      "GR",
      "HU",
      "CZ",
      "AE",
      "SA",
      "QA",
      "CL",
      "CO",
      "PE",
    ];

    for (const iso of isoCodes) {
      const exchCode = toExchangeCode(iso);
      expect(exchCode).not.toBeNull();
      expect(bloombergCurrency(exchCode)).not.toBeNull();
    }
  });
});
