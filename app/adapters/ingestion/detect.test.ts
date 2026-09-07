import { describe, expect, it } from "vitest";

import { detectBroker } from "./detect";

const TR_HEADER =
  "datetime,category,type,asset_class,name,symbol,shares,price,amount,fee,tax,currency,transaction_id";
const KRAKEN_HEADER = "refid,time,type,subclass,asset,amount,fee";

describe("detectBroker", () => {
  it("recognises a Trade Republic export by transaction_id", () => {
    expect(
      detectBroker(`${TR_HEADER}\n2026-01-02T10:00:00Z,,buy,,,,,,,,,,tr-1`),
    ).toBe("trade-republic");
  });

  it("recognises a Kraken export by refid", () => {
    expect(
      detectBroker(`${KRAKEN_HEADER}\nQ1,2026-01-02 10:00:00,trade,,XBT,1,0`),
    ).toBe("kraken");
  });

  it("reads the header even behind a BOM, padding or a different case", () => {
    expect(
      detectBroker(`\uFEFF REFID , time ,type,subclass,asset,amount,fee`),
    ).toBe("kraken");
  });

  it("refuses a file whose header matches neither broker", () => {
    expect(detectBroker("name,isin,weight\nACME,US0000000000,0.5")).toBeNull();
  });

  it("refuses an empty file", () => {
    expect(detectBroker("")).toBeNull();
    expect(detectBroker("\n\n")).toBeNull();
  });

  it("refuses rather than guess when both signatures are present", () => {
    expect(detectBroker(`refid,transaction_id,type\nA,B,buy`)).toBeNull();
  });
});
