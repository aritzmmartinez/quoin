import { describe, it, expect } from "vitest";
import {
  rowToEvent,
  eventToCreateData,
  rowToInstrument,
  instrumentToWriteData,
  type LedgerEntryRow,
  type InstrumentRow,
} from "./mappers";
import type { Instrument, LedgerEvent } from "~/core/domain";

function roundTripEvent(event: LedgerEvent): LedgerEvent {
  return rowToEvent(eventToCreateData(event));
}

const trade: LedgerEvent = {
  id: "e1",
  ts: new Date("2025-01-01"),
  type: "BUY",
  instrumentId: "IE00BK5BQT80",
  sleeve: "CORE",
  quantity: "1.5",
  price: "100",
  grossAmount: "150",
  fees: "1",
  currency: "EUR",
  fxToBase: "1",
  account: "trade-republic",
  source: "TR_CSV",
  externalId: "abc-123",
  note: null,
};

const dividend: LedgerEvent = {
  id: "e2",
  ts: new Date("2025-02-01"),
  type: "DIVIDEND",
  instrumentId: "US0378331005",
  sleeve: "CORE",
  grossAmount: "12.34",
  taxWithheld: "2.34",
  currency: "EUR",
  fxToBase: "1",
  account: "trade-republic",
  source: "TR_CSV",
  externalId: "div-1",
  note: null,
};

const cash: LedgerEvent = {
  id: "e3",
  ts: new Date("2025-03-01"),
  type: "DEPOSIT",
  grossAmount: "500",
  currency: "EUR",
  fxToBase: "1",
  account: "trade-republic",
  source: "TR_CSV",
  externalId: "dep-1",
  note: null,
};

const instrument: Instrument = {
  id: "IE00BK5BQT80",
  name: "Vanguard FTSE All-World UCITS ETF",
  type: "ETF",
  currency: "EUR",
  assetClass: "FUND",
  quoteSymbol: null,
  exposureKind: null,
  exposureLeafId: null,
};

describe("ledger mappers", () => {
  it("round-trips a trade event unchanged", () => {
    expect(roundTripEvent(trade)).toEqual(trade);
  });

  it("round-trips a dividend event unchanged", () => {
    expect(roundTripEvent(dividend)).toEqual(dividend);
  });

  it("round-trips a cash event unchanged", () => {
    expect(roundTripEvent(cash)).toEqual(cash);
  });

  it("rejects a corrupt row (BUY without quantity)", () => {
    const row = eventToCreateData(trade) as LedgerEntryRow;
    expect(() => rowToEvent({ ...row, quantity: null })).toThrow();
  });

  it("rejects a row with an unknown type", () => {
    const row = eventToCreateData(cash) as LedgerEntryRow;
    expect(() => rowToEvent({ ...row, type: "MYSTERY" })).toThrow(
      /Unknown ledger entry type/,
    );
  });
});

describe("instrument mappers", () => {
  it("round-trips an instrument unchanged", () => {
    const row: InstrumentRow = {
      ...instrumentToWriteData(instrument),
      quoteSymbol: null,
      exposureKind: null,
      exposureLeafId: null,
    };
    expect(rowToInstrument(row)).toEqual(instrument);
  });

  it("never writes the manually-set columns, so a re-import cannot clobber them", () => {
    const data = instrumentToWriteData({
      ...instrument,
      quoteSymbol: "VWCE.DE",
      exposureKind: "EQUITY_FUND",
      exposureLeafId: "X",
    });
    expect(data).not.toHaveProperty("quoteSymbol");
    expect(data).not.toHaveProperty("exposureKind");
    expect(data).not.toHaveProperty("exposureLeafId");
  });

  it("defaults a missing assetClass to null", () => {
    const { assetClass: _omitted, ...withoutAssetClass } = instrument;
    expect(instrumentToWriteData(withoutAssetClass).assetClass).toBeNull();
  });

  it("rejects a row with an invalid instrument type", () => {
    const row = instrumentToWriteData(instrument) as InstrumentRow;
    expect(() => rowToInstrument({ ...row, type: "WEIRD" })).toThrow();
  });
});
