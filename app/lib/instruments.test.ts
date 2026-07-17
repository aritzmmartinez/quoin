import { describe, expect, it } from "vitest";

import type { Instrument, Sleeve } from "~/core/domain";
import type { MarketValue, Position } from "~/core/projections";
import { tradeMetaKey } from "~/core/projections";

import { needsMapping, toInstrumentListItems } from "./instruments";

const instrument = (over: Partial<Instrument> = {}): Instrument => ({
  id: "IE00BK5BQT80",
  name: "FTSE All-World",
  type: "ETF",
  currency: "EUR",
  assetClass: "FUND",
  quoteSymbol: null,
  exposureKind: null,
  exposureLeafId: null,
  ...over,
});

const position = (id: string, qty: string, sleeve: Sleeve = "CORE"): Position =>
  ({
    instrumentId: id,
    sleeve,
    quantity: qty,
    costBasis: "0",
    realizedPnL: "0",
  }) as Position;

const priced = (
  id: string,
  value: string | null,
  sleeve: Sleeve = "CORE",
): [string, MarketValue] => [
  tradeMetaKey(id, sleeve),
  { marketValue: value } as MarketValue,
];

describe("toInstrumentListItems", () => {
  it("shows what an instrument resolves to and where that came from", () => {
    const [item] = toInstrumentListItems(
      [instrument({ id: "US67066G1040", name: "NVIDIA", type: "STOCK" })],
      [position("US67066G1040", "10")],
      new Map([priced("US67066G1040", "1250.00")]),
    );
    expect(item?.resolvesTo).toBe("COMPANY:US67066G1040");
    expect(item?.isExplicit).toBe(false);
    expect(item?.value).toBe("1250.00");
  });

  it("marks an explicit mapping as explicit", () => {
    const [item] = toInstrumentListItems(
      [instrument({ exposureKind: "COMMODITY", exposureLeafId: "XAU" })],
      [],
      new Map(),
    );
    expect(item?.resolvesTo).toBe("COMMODITY:XAU");
    expect(item?.isExplicit).toBe(true);
  });

  it("flags a closed position, where every derived number reads zero", () => {
    const [item] = toInstrumentListItems(
      [instrument()],
      [position("IE00BK5BQT80", "0")],
      new Map(),
    );
    expect(item?.isClosed).toBe(true);
  });

  it("treats an instrument with no position at all as closed", () => {
    const [item] = toInstrumentListItems([instrument()], [], new Map());
    expect(item?.isClosed).toBe(true);
    expect(item?.quantity).toBe("0");
  });

  it("reports an unpriced instrument as null, not zero", () => {
    // Zero would read as "worth nothing"; null reads as "we do not know".
    const [item] = toInstrumentListItems(
      [instrument()],
      [position("IE00BK5BQT80", "10")],
      new Map([priced("IE00BK5BQT80", null)]),
    );
    expect(item?.value).toBeNull();
  });

  it("sums quantity and value across sleeves of the same instrument", () => {
    const [item] = toInstrumentListItems(
      [instrument()],
      [
        position("IE00BK5BQT80", "10"),
        position("IE00BK5BQT80", "5", "TRADING"),
      ],
      new Map([
        priced("IE00BK5BQT80", "1000.00"),
        priced("IE00BK5BQT80", "500.00", "TRADING"),
      ]),
    );
    expect(item?.quantity).toBe("15");
    expect(item?.value).toBe("1500.00");
    expect(item?.isClosed).toBe(false);
  });

  it("orders by value, so the biggest holding leads rather than the earliest id", () => {
    const items = toInstrumentListItems(
      [
        instrument({ id: "BTC", name: "Bitcoin" }),
        instrument({ id: "IE00BK5BQT80", name: "FTSE All-World" }),
        instrument({ id: "US67066G1040", name: "NVIDIA" }),
      ],
      [
        position("BTC", "1"),
        position("IE00BK5BQT80", "1"),
        position("US67066G1040", "1"),
      ],
      new Map([
        priced("BTC", "1296.97"),
        priced("IE00BK5BQT80", "4391.87"),
        priced("US67066G1040", "1204.36"),
      ]),
    );
    expect(items.map((i) => i.name)).toEqual([
      "FTSE All-World",
      "Bitcoin",
      "NVIDIA",
    ]);
  });

  it("sinks unpriced and closed positions below anything with a value", () => {
    const items = toInstrumentListItems(
      [
        instrument({ id: "CLOSED", name: "Vendida" }),
        instrument({ id: "HELD", name: "Abierta" }),
      ],
      [position("CLOSED", "0"), position("HELD", "1")],
      new Map([priced("HELD", "100.00")]),
    );
    expect(items.map((i) => i.name)).toEqual(["Abierta", "Vendida"]);
  });

  it("breaks ties by name so the order is stable, not incidental", () => {
    const items = toInstrumentListItems(
      [
        instrument({ id: "B", name: "Zeta" }),
        instrument({ id: "A", name: "Alfa" }),
      ],
      [],
      new Map(),
    );
    expect(items.map((i) => i.name)).toEqual(["Alfa", "Zeta"]);
  });

  it("keeps every instrument, held or not", () => {
    const items = toInstrumentListItems(
      [instrument({ id: "A" }), instrument({ id: "B" })],
      [],
      new Map(),
    );
    expect(items).toHaveLength(2);
  });
});

describe("needsMapping", () => {
  it("lists only instruments riding the type default into UNRESOLVED", () => {
    const items = toInstrumentListItems(
      [
        instrument({ id: "FUND_DEFAULT" }),
        instrument({ id: "FUND_EXPLICIT", exposureKind: "EQUITY_FUND" }),
        instrument({ id: "STOCK", type: "STOCK" }),
        instrument({
          id: "GOLD",
          exposureKind: "COMMODITY",
          exposureLeafId: "XAU",
        }),
      ],
      [],
      new Map(),
    );
    expect(needsMapping(items).map((i) => i.id)).toEqual(["FUND_DEFAULT"]);
  });

  it("is empty when everything is classified", () => {
    const items = toInstrumentListItems(
      [instrument({ id: "S", type: "STOCK" })],
      [],
      new Map(),
    );
    expect(needsMapping(items)).toEqual([]);
  });
});
