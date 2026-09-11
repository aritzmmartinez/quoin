import { describe, expect, it } from "vitest";

import type { Instrument } from "~/core/domain";
import type { InstrumentRepository, PriceRepository } from "~/core/ports";

import { remapQuoteSymbol } from "./quote-symbol";

const INSTRUMENT: Instrument = {
  id: "XS00TEST0003",
  name: "Test Instrument",
  type: "ETF",
  currency: "EUR",
  quoteSymbol: "OLD.DE",
  exposureKind: null,
  exposureLeafId: null,
  ter: null,
  hedgedToBase: false,
  thesis: "CORE",
};

function fakes(stored: Instrument | null = INSTRUMENT) {
  const calls: string[] = [];
  const instruments = {
    get: async (id: string) =>
      stored && stored.id === id ? { ...stored } : null,
    setQuoteSymbol: async (_id: string, symbol: string | null) => {
      calls.push(`set:${symbol ?? "null"}`);
    },
  } as unknown as InstrumentRepository;
  const prices = {
    deleteForInstrument: async (_id: string) => {
      calls.push("delete");
      return 412;
    },
  } as unknown as PriceRepository;
  return { calls, instruments, prices };
}

describe("remapQuoteSymbol", () => {
  it("deletes the old snapshots BEFORE storing the new symbol", async () => {
    const { calls, instruments, prices } = fakes();

    const result = await remapQuoteSymbol(
      instruments,
      prices,
      INSTRUMENT.id,
      "NEW.DE",
    );

    expect(calls).toEqual(["delete", "set:NEW.DE"]);
    expect(result).toEqual({ symbol: "NEW.DE", removed: 412 });
  });

  it("keeps the series when the symbol is unchanged", async () => {
    const { calls, instruments, prices } = fakes();

    const result = await remapQuoteSymbol(
      instruments,
      prices,
      INSTRUMENT.id,
      "OLD.DE",
    );

    expect(calls).toEqual(["set:OLD.DE"]);
    expect(result.removed).toBe(0);
  });

  it("clears the symbol and its snapshots together", async () => {
    const { calls, instruments, prices } = fakes();

    await remapQuoteSymbol(instruments, prices, INSTRUMENT.id, null);

    expect(calls).toEqual(["delete", "set:null"]);
  });

  it("deletes on a first mapping only if there was something to delete", async () => {
    const { calls, instruments, prices } = fakes({
      ...INSTRUMENT,
      quoteSymbol: null,
    });

    await remapQuoteSymbol(instruments, prices, INSTRUMENT.id, "NEW.DE");

    expect(calls).toEqual(["delete", "set:NEW.DE"]);
  });

  it("refuses an unknown instrument without touching anything", async () => {
    const { calls, instruments, prices } = fakes(null);

    await expect(
      remapQuoteSymbol(instruments, prices, "NOPE", "NEW.DE"),
    ).rejects.toThrow(/NOPE/);
    expect(calls).toEqual([]);
  });
});
