import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { HoldingsParseError, parseHoldingsCsv } from "./parse";
import { xlsxToHoldingsCsv } from "./xlsx";

function workbook(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const HOLDINGS: unknown[][] = [
  ["Ticker", "Holding name", "% of market value", "Region"],
  ["AAAA", "Alpha Corp", 40, "US"],
  ["6857", "Beta Industries", 30, "JP"],
  ["CCCC", "Gamma Ltd", 20, "GB"],
  ["DDDD", "Delta SA", 10, "FR"],
];

describe("xlsxToHoldingsCsv", () => {
  it("renders a single holdings sheet into a CSV the parser reads", () => {
    const csv = xlsxToHoldingsCsv(workbook({ Holdings: HOLDINGS }));
    const parsed = parseHoldingsCsv(csv);
    expect(parsed.columns.identity).toBe("Ticker");
    expect(parsed.holdings.map((h) => h.identity)).toContain("6857");
  });

  it("reads a weight stored as a fraction, letting scale detection handle it", () => {
    const csv = xlsxToHoldingsCsv(
      workbook({
        Holdings: [
          ["ISIN code", "Name", "Weight"],
          ["TW0002330008", "Alpha Semiconductor", 0.4],
          ["KR7005930003", "Beta Electronics", 0.35],
          ["US0000000001", "Gamma Inc", 0.25],
        ],
      }),
    );
    const parsed = parseHoldingsCsv(csv);
    expect(parsed.weightScale).toBe("1");
    expect(
      parsed.holdings.find((h) => h.identity === "TW0002330008")?.weight,
    ).toBe("0.4");
  });

  it("picks the holdings sheet out of a workbook that also carries prose", () => {
    const csv = xlsxToHoldingsCsv(
      workbook({
        Disclaimer: [
          ["This document is for information purposes only."],
          ["Past performance is not a guide to future performance."],
        ],
        Holdings: HOLDINGS,
      }),
    );
    expect(parseHoldingsCsv(csv).columns.identity).toBe("Ticker");
  });

  it("skips a preamble above the header, as issuers ship", () => {
    const csv = xlsxToHoldingsCsv(
      workbook({
        Holdings: [["Fund Holdings as of", "27/07/2026"], [], ...HOLDINGS],
      }),
    );
    const parsed = parseHoldingsCsv(csv);
    expect(parsed.asOfHint).toBe("27/07/2026");
    expect(parsed.holdings).toHaveLength(4);
  });

  it("rejects a market-allocation workbook rather than reading countries as holdings", () => {
    const marketAllocation: unknown[][] = [
      ["Country", "Region", "Fund"],
      ["United States of America", "North America", 61.7],
      ["Japan", "Pacific", 5.9],
      ["Taiwan", "Emerging Markets", 3.4],
      ["United Kingdom", "Europe", 3.2],
      ["China", "Emerging Markets", 3.1],
      ["India", "Emerging Markets", 2.5],
      ["France", "Europe", 2.4],
      ["Germany", "Europe", 2.2],
      ["Switzerland", "Europe", 2.1],
      ["Rest of World", "World", 13.5],
    ];
    expect(() =>
      xlsxToHoldingsCsv(workbook({ Allocation: marketAllocation })),
    ).toThrow(HoldingsParseError);
  });

  it("refuses to guess when two sheets both look like holdings", () => {
    expect(() =>
      xlsxToHoldingsCsv(workbook({ Equities: HOLDINGS, Bonds: HOLDINGS })),
    ).toThrow(/more than one sheet/i);
  });

  it("rejects a file too large to be a holdings export before parsing", () => {
    expect(() => xlsxToHoldingsCsv(new ArrayBuffer(26 * 1024 * 1024))).toThrow(
      /too large/i,
    );
  });
});
