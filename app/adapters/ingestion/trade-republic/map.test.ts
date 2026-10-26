import { describe, it, expect } from "vitest";
import { mapRow } from "./map";
import type { TradeRepublicRow } from "./row";

function row(over: Partial<TradeRepublicRow> = {}): TradeRepublicRow {
  return {
    datetime: "2025-01-01T10:00:00.000Z",
    category: "TRADING",
    type: "BUY",
    asset_class: "FUND",
    name: "Test ETF",
    symbol: "IE00TEST0001",
    shares: "1",
    price: "100",
    amount: "-100",
    fee: "",
    tax: "",
    currency: "EUR",
    transaction_id: "tx-1",
    ...over,
  };
}

describe("mapRow", () => {
  it("maps a BUY into an instrument + trade event with magnitudes", () => {
    const result = mapRow(
      row({ amount: "-36.64", fee: "-1.00", shares: "1", price: "36.64" }),
    );
    expect(result.kind).toBe("domain");
    if (result.kind !== "domain") return;
    expect(result.instrument).toEqual({
      id: "IE00TEST0001",
      name: "Test ETF",
      type: "ETF",
      assetClass: "FUND",
      thesis: "CORE",
    });
    expect(result.event.type).toBe("BUY");
    if (result.event.type === "BUY") {
      expect(result.event.grossAmount).toBe("36.64");
      expect(result.event.fees).toBe("1");
      expect(result.event.quantity).toBe("1");
      expect(result.event.externalId).toBe("tx-1");
    }
  });

  it("maps a SELL", () => {
    const result = mapRow(
      row({ type: "SELL", amount: "250", shares: "1", price: "250" }),
    );
    expect(result.kind === "domain" && result.event.type).toBe("SELL");
  });

  it("maps a DIVIDEND with tax withheld", () => {
    const result = mapRow(
      row({
        category: "CASH",
        type: "DIVIDEND",
        amount: "12.34",
        tax: "-2.34",
      }),
    );
    expect(result.kind).toBe("domain");
    if (result.kind === "domain" && result.event.type === "DIVIDEND") {
      expect(result.event.grossAmount).toBe("12.34");
      expect(result.event.taxWithheld).toBe("2.34");
    }
  });

  it("maps cash movements (interest, deposit variants, withdrawal)", () => {
    const interest = mapRow(
      row({ category: "CASH", type: "INTEREST_PAYMENT", amount: "1.2" }),
    );
    expect(interest.kind === "domain" && interest.event.type).toBe("INTEREST");

    for (const type of [
      "CUSTOMER_INPAYMENT",
      "TRANSFER_INSTANT_INBOUND",
      "TRANSFER_DIRECT_DEBIT_INBOUND",
      "TRANSFER_INBOUND",
    ]) {
      const dep = mapRow(row({ category: "CASH", type, amount: "500" }));
      expect(dep.kind === "domain" && dep.event.type).toBe("DEPOSIT");
    }

    const out = mapRow(
      row({
        category: "CASH",
        type: "TRANSFER_INSTANT_OUTBOUND",
        amount: "-200",
      }),
    );
    expect(out.kind).toBe("domain");
    if (out.kind === "domain" && out.event.type === "WITHDRAWAL") {
      expect(out.event.grossAmount).toBe("200");
    }
  });

  it("discards card spending", () => {
    for (const type of ["CARD_TRANSACTION", "CARD_TRANSACTION_INTERNATIONAL"]) {
      const result = mapRow(row({ category: "CASH", type, amount: "-2.99" }));
      expect(result).toEqual({ kind: "discard", reason: "card-spending" });
    }
  });

  it("discards an unpaired saveback, and corporate actions as unsupported, keeping the row", () => {
    expect(
      mapRow(
        row({
          category: "CASH",
          type: "BENEFITS_SAVEBACK",
          name: "Test ETF",
          amount: "0.5",
        }),
      ),
    ).toEqual({
      kind: "discard",
      reason: "saveback-unpaired",
      detail: {
        date: "2025-01-01T10:00:00.000Z",
        type: "BENEFITS_SAVEBACK",
        subtype: null,
        instrument: "Test ETF",
      },
    });
    expect(
      mapRow(
        row({
          category: "CORPORATE_ACTION",
          type: "LIQUIDATION_DIVIDEND",
          name: "",
          amount: "1",
        }),
      ),
    ).toEqual({
      kind: "discard",
      reason: "unsupported",
      detail: {
        date: "2025-01-01T10:00:00.000Z",
        type: "LIQUIDATION_DIVIDEND",
        subtype: null,
        instrument: null,
      },
    });
  });

  it("maps asset classes to instrument types", () => {
    const type = (assetClass: string, symbol = "IE00TEST0001") => {
      const r = mapRow(row({ asset_class: assetClass, symbol }));
      return r.kind === "domain" ? r.instrument?.type : null;
    };
    expect(type("STOCK")).toBe("STOCK");
    expect(type("CRYPTO", "BTC")).toBe("CRYPTO");
    expect(type("SYNTHETIC")).toBe("ETF");
  });

  it("takes a crypto asset's code as its instrument id", () => {
    const result = mapRow(
      row({ asset_class: "CRYPTO", name: "Bitcoin", symbol: "BTC" }),
    );
    expect(result.kind).toBe("domain");
    if (result.kind !== "domain") return;
    expect(result.instrument?.id).toBe("BTC");
    expect(result.event.type === "BUY" && result.event.instrumentId).toBe(
      "BTC",
    );
  });

  it("sets aside a crypto row whose symbol is not an asset code, naming it", () => {
    const crypto = { asset_class: "CRYPTO", name: "Bitcoin" };
    for (const over of [
      { symbol: "XF000BTC0017" },
      { category: "CASH", type: "DIVIDEND", symbol: "XF000BTC0017" },
    ]) {
      expect(mapRow(row({ ...crypto, ...over }))).toEqual({
        kind: "discard",
        reason: "invalid-crypto-code",
        detail: {
          date: "2025-01-01T10:00:00.000Z",
          type: over.type ?? "BUY",
          subtype: null,
          instrument: "XF000BTC0017",
        },
      });
    }
  });

  it("leaves a non-crypto symbol as it stands", () => {
    const result = mapRow(row({ asset_class: "STOCK", symbol: "us0000test" }));
    expect(result.kind === "domain" && result.instrument?.id).toBe(
      "us0000test",
    );
  });

  it("throws on an unknown asset class (surfaced, not silently mis-typed)", () => {
    expect(() => mapRow(row({ asset_class: "WEIRD" }))).toThrow(
      /Unknown asset class/,
    );
  });
});
