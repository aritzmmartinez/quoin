import { describe, expect, it } from "vitest";

import type { EtfHolding } from "~/core/ports";

import { hasObsoleteVenue } from "./obsolete-venues";

const holding = (
  identity: string,
  identityKind: EtfHolding["identityKind"] = "TICKER",
): EtfHolding => ({
  instrumentId: "FUND",
  identity,
  identityKind,
  name: "Alpha SA",
  weight: "0.01",
  asOf: new Date("2026-07-27T00:00:00.000Z"),
});

describe("hasObsoleteVenue", () => {
  it("flags a composition stored under a retired country code", () => {
    expect(hasObsoleteVenue([holding("AAA.US"), holding("SAN.FX")])).toBe(true);
    expect(hasObsoleteVenue([holding("VOD.UK")])).toBe(true);
  });

  it("does not flag current codes", () => {
    expect(hasObsoleteVenue([holding("SAN.FR"), holding("VOD.GB")])).toBe(
      false,
    );
  });

  it("does not flag a Bloomberg exchange code CLDR also retired", () => {
    expect(hasObsoleteVenue([holding("XYZ.CT")])).toBe(false);
  });

  it("ignores ISIN rows and tickers without a venue", () => {
    expect(hasObsoleteVenue([holding("FR0000000001", "ISIN")])).toBe(false);
    expect(hasObsoleteVenue([holding("SAN")])).toBe(false);
    expect(hasObsoleteVenue([])).toBe(false);
  });
});
