import { describe, it, expect } from "vitest";

import { KRAKEN_HEADER, krakenCsv } from "./csv-fixture";
import { KrakenLegacyExportError, parseKrakenCsv } from "./row";

const CSV = krakenCsv([
  {
    refid: "R1",
    time: "2025-11-06 13:30:00",
    type: "deposit",
    subclass: "fiat",
    asset: "EUR",
    amount: "200",
  },
]);

describe("parseKrakenCsv", () => {
  it("parses a valid row, every column of the export", () => {
    const rows = parseKrakenCsv(CSV);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      txid: "L1",
      refid: "R1",
      aclass: "currency",
      wallet: "spot / main",
      balance: "200",
    });
  });

  it("drops a phantom row (all-empty fields) instead of failing validation", () => {
    const empty = KRAKEN_HEADER.replace(/[^,]/g, "");
    const rows = parseKrakenCsv([CSV, empty].join("\n"));
    expect(rows).toHaveLength(1);
  });

  it("skips whitespace-only trailing lines", () => {
    const rows = parseKrakenCsv([...CSV.split("\n"), "   ", ""].join("\r\n"));
    expect(rows).toHaveLength(1);
  });

  it("refuses an old export, which has no wallet column", () => {
    const legacy = [
      "txid,refid,time,type,subtype,aclass,asset,amount,fee,balance",
      `"L1","R1","2021-03-01 10:00:00","deposit","","currency","ZEUR",200,0,200`,
    ].join("\n");
    expect(() => parseKrakenCsv(legacy)).toThrow(KrakenLegacyExportError);
  });
});
