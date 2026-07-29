import { describe, expect, it } from "vitest";

import { toExchangeCode, venueOf } from "./venues";

describe("venueOf", () => {
  it("reads the venue the holdings parser appended", () => {
    expect(venueOf("NVDA.US")).toBe("US");
    expect(venueOf("2330.TW")).toBe("TW");
  });

  it("takes only the last segment, since tickers carry their own dots", () => {
    expect(venueOf("BRK.B.US")).toBe("US");
  });

  it("has nothing to say about an unqualified value", () => {
    expect(venueOf("NVDA")).toBeNull();
    expect(venueOf("NVDA.")).toBeNull();
  });
});

describe("toExchangeCode", () => {
  it("bridges ISO to Bloomberg where they differ", () => {
    expect(toExchangeCode("TW")).toBe("TT");
    expect(toExchangeCode("JP")).toBe("JT");
    expect(toExchangeCode("KR")).toBe("KS");
    expect(toExchangeCode("GB")).toBe("LN");
    expect(toExchangeCode("DE")).toBe("GR");
  });

  it("passes through the few that coincide", () => {
    expect(toExchangeCode("US")).toBe("US");
    expect(toExchangeCode("HK")).toBe("HK");
  });

  it("returns null for anything unlisted, which means no filtering", () => {
    expect(toExchangeCode("ZZ")).toBeNull();
    expect(toExchangeCode(null)).toBeNull();
    expect(toExchangeCode("")).toBeNull();
  });
});
