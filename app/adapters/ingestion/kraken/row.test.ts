import { describe, it, expect } from "vitest";
import { parseKrakenCsv } from "./row";

const HEADER =
  "txid,refid,time,type,subtype,aclass,subclass,asset,wallet,amount,fee,balance";
const ROW = `"x","R1","2025-11-06 13:30:00","deposit","","currency","fiat","EUR","spot / main",200,0,200`;

describe("parseKrakenCsv", () => {
  it("parses a valid row", () => {
    const rows = parseKrakenCsv([HEADER, ROW].join("\n"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.refid).toBe("R1");
  });

  it("drops a phantom row (all-empty fields) instead of failing validation", () => {
    const rows = parseKrakenCsv([HEADER, ROW, ",,,,,,,,,,,"].join("\n"));
    expect(rows).toHaveLength(1);
  });

  it("skips whitespace-only trailing lines", () => {
    const rows = parseKrakenCsv([HEADER, ROW, "   ", ""].join("\r\n"));
    expect(rows).toHaveLength(1);
  });
});
