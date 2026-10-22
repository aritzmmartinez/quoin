import { describe, expect, it } from "vitest";

import type { Instrument } from "~/core/domain";
import type { Position } from "~/core/projections";

import { openInstrumentIds, unratedNames } from "./unrated";

const instrument = (id: string, name: string): Instrument => ({
  id,
  name,
  type: "STOCK",
  thesis: "CORE",
});

const INSTRUMENTS = [
  instrument("US00TEST0001", "Zeta Corp"),
  instrument("GB00TEST0001", "Alpha plc"),
  instrument("IE00TEST0001", "Euro Fund"),
];

describe("unratedNames", () => {
  it("names the relevant instruments left unvalued, with their currencies", () => {
    expect(
      unratedNames(
        new Map([
          ["US00TEST0001", "USD"],
          ["GB00TEST0001", "GBP"],
        ]),
        INSTRUMENTS,
        ["US00TEST0001", "GB00TEST0001", "IE00TEST0001"],
      ),
    ).toEqual({ names: ["Alpha plc", "Zeta Corp"], currencies: ["GBP", "USD"] });
  });

  it("names a currency once however many instruments share it", () => {
    expect(
      unratedNames(
        new Map([
          ["US00TEST0001", "USD"],
          ["GB00TEST0001", "USD"],
        ]),
        INSTRUMENTS,
        ["US00TEST0001", "GB00TEST0001"],
      )?.currencies,
    ).toEqual(["USD"]);
  });

  it("says nothing about an instrument that is not relevant, such as one sold", () => {
    expect(
      unratedNames(
        new Map([["US00TEST0001", "USD"]]),
        INSTRUMENTS,
        ["IE00TEST0001"],
      ),
    ).toBeNull();
  });

  it("falls back to the id of an instrument it does not know", () => {
    expect(
      unratedNames(new Map([["XX", "USD"]]), [], ["XX"])?.names,
    ).toEqual(["XX"]);
  });
});

describe("openInstrumentIds", () => {
  it("keeps only positions still held", () => {
    const position = (instrumentId: string, quantity: string) =>
      ({ instrumentId, quantity }) as Position;
    expect(
      openInstrumentIds([position("A", "2"), position("B", "0")]),
    ).toEqual(["A"]);
  });
});
