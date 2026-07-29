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
      currency: "EUR",
      assetClass: "FUND",
    });
    expect(result.event.type).toBe("BUY");
    if (result.event.type === "BUY") {
      expect(result.event.grossAmount).toBe("36.64");
      expect(result.event.fees).toBe("1");
      expect(result.event.quantity).toBe("1");
      expect(result.event.sleeve).toBe("CORE");
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

  it("discards saveback and corporate actions as unsupported", () => {
    expect(
      mapRow(
        row({ category: "CASH", type: "BENEFITS_SAVEBACK", amount: "0.5" }),
      ),
    ).toEqual({
      kind: "discard",
      reason: "unsupported",
    });
    expect(
      mapRow(
        row({
          category: "CORPORATE_ACTION",
          type: "LIQUIDATION_DIVIDEND",
          amount: "1",
        }),
      ),
    ).toEqual({ kind: "discard", reason: "unsupported" });
  });

  it("maps asset classes to instrument types", () => {
    const type = (assetClass: string) => {
      const r = mapRow(row({ asset_class: assetClass }));
      return r.kind === "domain" ? r.instrument?.type : null;
    };
    expect(type("STOCK")).toBe("STOCK");
    expect(type("CRYPTO")).toBe("CRYPTO");
    expect(type("SYNTHETIC")).toBe("ETF");
  });

  it("throws on an unknown asset class (surfaced, not silently mis-typed)", () => {
    expect(() => mapRow(row({ asset_class: "WEIRD" }))).toThrow(
      /Unknown asset class/,
    );
  });
});
