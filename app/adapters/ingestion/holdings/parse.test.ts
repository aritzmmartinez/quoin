import { describe, expect, it } from "vitest";

import { HoldingsParseError, parseHoldingsCsv } from "./parse";

/**
 * Every fixture below is SYNTHETIC. The shapes are copied from real issuer
 * exports, but the funds and weights are invented: the set of funds whose
 * holdings get imported is the owner's portfolio, and this repository is public.
 * Same rule that keeps quoteSymbol out of the repo.
 */

// Shape: dot decimals with a percent sign, ticker only, numeric Asian tickers,
// and a Region column whose codes look exactly like tickers.
const TICKER_STYLE = `Ticker,Holding name,% of market value,Sector,Region,Market value,Shares
AAAA,Alpha Corp,4.4503%,Technology,US,"$3,387,048,086.07","16,927,623"
6857,Beta Industries,2.6398%,Industrials,JP,"$2,009,099,894.76","5,386,038"
CCCC,Gamma Ltd,1.1776%,Financials,GB,"$900,000,000.00","1,000,000"
DDDD,Delta SA,0.9000%,Energy,FR,"$700,000,000.00","900,000"
EEEE,Epsilon NV,90.0000%,Utilities,NL,"$100.00",1
`;

// Shape: comma decimals, leading space, an asset-class column, and a negative
// futures line.
const COMMA_STYLE = `ISIN code,Name,Asset class,Currency,Weight,Sector,Country
TW0002330008,ALPHA SEMICONDUCTOR,EQUITY,TWD," 15,51%",Information Technology,Taiwan
KR7005930003,BETA ELECTRONIC CO LTD,EQUITY,KRW," 6,90%",Information Technology,South Korea
US0000000001,GAMMA INC,EQUITY,USD," 76,50%",Financials,United States
DE000C771U47,SOME INDEX FUT 09/26 EUREX,FUTURE,USD,"- 0,02%",,Supranationals
`;

// Shape: preamble title line, a non-breaking space spacer, U+2019 thousands
// separators, weights with no percent sign, and negative cash.
const PREAMBLE_STYLE = `\uFEFFFund Holdings as of,"15/Jul/2026"
\u00a0
Ticker,Name,Sector,Asset Class,Market Value,Weight (%),Notional Value,Shares,Price,Location,Exchange,Market Currency
"AAAA","ALPHA CORP","Information Technology","Equity","174’598’847","40.43","174’598’846.64","898’400","194.34","United States","NASDAQ","USD"
"HEXA B","BETA AB","Industrials","Equity","167’415’643","60.15","167’415’642.91","615’793","271.87","Sweden","Nasdaq Stockholm","SEK"
"USD","USD CASH","Cash and/or Derivatives","Cash","-22’190’240","-0.58","-22’190’239.59","-22’190’239","100.00","United States","-","USD"
`;

// Shape: Spanish headers, a numbered index column, and an "everything else"
// bucket whose identity is a dash.
const SPANISH_STYLE = `Número,Nombre de la posición,Ticker,ISIN,Acciones,Valor de mercado,% de activos netos
1,Alpha Corp,AAA US,CA13321L1085,3.541.827,$ 322.235.420.00,"14,64%"
2,Beta Trust,B-B CN,CA85210A1049,8.744.183,$ 166.899.611.00,"85,35%"
3,Otros/efectivo, -- , -- , -- ,$ 112.075.00,"0,01%"
`;

describe("parseHoldingsCsv — issuer agnosticism", () => {
  it("reads a ticker-only file and does not mistake Region for the identity", () => {
    // Region holds "US", "JP", "GB" — perfectly ticker-shaped, but it repeats.
    // An identity column is mostly unique; that is what separates them.
    const result = parseHoldingsCsv(TICKER_STYLE);
    expect(result.columns.identity).toBe("Ticker");
    expect(result.columns.identityKind).toBe("TICKER");
    expect(result.columns.name).toBe("Holding name");
    expect(result.columns.weight).toBe("% of market value");
  });

  it("keeps numeric tickers, which whole exchanges use", () => {
    const result = parseHoldingsCsv(TICKER_STYLE);
    expect(result.holdings.map((h) => h.identity)).toContain("6857");
  });

  it("reads comma decimals and a sign detached from its digits", () => {
    const result = parseHoldingsCsv(COMMA_STYLE);
    expect(result.columns.identity).toBe("ISIN code");
    expect(result.columns.identityKind).toBe("ISIN");
    expect(result.holdings[0]?.weight).toBe("0.1551");
  });

  it("skips a preamble, a BOM and a non-breaking space to find the header", () => {
    const result = parseHoldingsCsv(PREAMBLE_STYLE);
    expect(result.columns.weight).toBe("Weight (%)");
    expect(result.holdings).toHaveLength(2);
  });

  it("picks up the as-of date an issuer hides in its title line", () => {
    expect(parseHoldingsCsv(PREAMBLE_STYLE).asOfHint).toBe("15/Jul/2026");
  });

  it("has no hint to offer when there is no preamble", () => {
    expect(parseHoldingsCsv(TICKER_STYLE).asOfHint).toBeNull();
  });

  it("reads Spanish headers with no issuer-specific rule", () => {
    const result = parseHoldingsCsv(SPANISH_STYLE);
    expect(result.columns.weight).toBe("% de activos netos");
    expect(result.columns.identity).toBe("ISIN");
  });

  it("keeps a Nordic ticker written with a space", () => {
    const result = parseHoldingsCsv(PREAMBLE_STYLE);
    expect(result.holdings.map((h) => h.identity)).toContain("HEXA B");
  });
});

describe("parseHoldingsCsv — the residual", () => {
  it("folds cash into the residual rather than making a leaf of it", () => {
    const result = parseHoldingsCsv(PREAMBLE_STYLE);
    expect(result.holdings.map((h) => h.name)).not.toContain("USD CASH");
    expect(result.foldedRows).toBe(1);
  });

  it("goes negative when a fund carries negative cash, rather than clamping", () => {
    // 40.43 + 60.15 = 100.58% of equity, financed by -0.58% of cash. Clamping
    // would quietly hide that the fund is geared; the weights still sum to 1.
    const result = parseHoldingsCsv(PREAMBLE_STYLE);
    expect(result.covered).toBe("1.0058");
    expect(result.residual).toBe("-0.0058");
  });

  it("folds an issuer's own catch-all bucket", () => {
    // "Otros/efectivo" carries a real weight and an identity of "--".
    const result = parseHoldingsCsv(SPANISH_STYLE);
    expect(result.holdings).toHaveLength(2);
    expect(result.foldedRows).toBe(1);
  });

  it("folds a negative futures line", () => {
    const result = parseHoldingsCsv(COMMA_STYLE);
    expect(result.holdings.map((h) => h.name)).not.toContain(
      "SOME INDEX FUT 09/26 EUREX",
    );
  });

  it("accounts for every scrap of weight: covered + residual is exactly 1", () => {
    for (const csv of [TICKER_STYLE, COMMA_STYLE, PREAMBLE_STYLE, SPANISH_STYLE]) {
      const { covered, residual } = parseHoldingsCsv(csv);
      expect(Number(covered) + Number(residual)).toBeCloseTo(1, 10);
    }
  });
});

describe("parseHoldingsCsv — refusing to guess", () => {
  it("rejects a file where nothing adds up to about 100%", () => {
    const csv = `Ticker,Name,Sector,Some Number
AAAA,Alpha Corp,Tech,12
BBBB,Beta Corp,Energy,7
`;
    expect(() => parseHoldingsCsv(csv)).toThrow(HoldingsParseError);
  });

  it("rejects a file with no header at all", () => {
    expect(() => parseHoldingsCsv("1,2\n3,4\n")).toThrow(HoldingsParseError);
  });

  it("rejects an empty file", () => {
    expect(() => parseHoldingsCsv("")).toThrow(HoldingsParseError);
  });

  it("accepts a column override when detection picks wrong", () => {
    const result = parseHoldingsCsv(TICKER_STYLE, { name: "Sector" });
    expect(result.columns.name).toBe("Sector");
    expect(result.holdings[0]?.name).toBe("Technology");
  });

  it("reports every header so a person can correct the mapping", () => {
    expect(parseHoldingsCsv(TICKER_STYLE).headers).toEqual([
      "Ticker",
      "Holding name",
      "% of market value",
      "Sector",
      "Region",
      "Market value",
      "Shares",
    ]);
  });
});
