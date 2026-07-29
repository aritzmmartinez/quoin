import { describe, expect, it } from "vitest";

import { parseAsOfHint } from "./detect";
import { HoldingsParseError, parseHoldingsCsv } from "./parse";

const TICKER_STYLE = `Ticker,Holding name,% of market value,Sector,Region,Market value,Shares
AAAA,Alpha Corp,4.4503%,Technology,US,"$3,387,048,086.07","16,927,623"
6857,Beta Industries,2.6398%,Industrials,JP,"$2,009,099,894.76","5,386,038"
CCCC,Gamma Ltd,1.1776%,Financials,GB,"$900,000,000.00","1,000,000"
DDDD,Delta SA,0.9000%,Energy,FR,"$700,000,000.00","900,000"
EEEE,Epsilon NV,90.0000%,Utilities,NL,"$100.00",1
`;

const COMMA_STYLE = `ISIN code,Name,Asset class,Currency,Weight,Sector,Country
TW0002330008,ALPHA SEMICONDUCTOR,EQUITY,TWD," 15,51%",Information Technology,Taiwan
KR7005930003,BETA ELECTRONIC CO LTD,EQUITY,KRW," 6,90%",Information Technology,South Korea
US0000000001,GAMMA INC,EQUITY,USD," 76,50%",Financials,United States
DE000C771U47,SOME INDEX FUT 09/26 EUREX,FUTURE,USD,"- 0,02%",,Supranationals
`;

const PREAMBLE_STYLE = `\uFEFFFund Holdings as of,"15/Jul/2026"
\u00a0
Ticker,Name,Sector,Asset Class,Market Value,Weight (%),Notional Value,Shares,Price,Location,Exchange,Market Currency
"AAAA","ALPHA CORP","Information Technology","Equity","174’598’847","40.43","174’598’846.64","898’400","194.34","United States","NASDAQ","USD"
"HEXA B","BETA AB","Industrials","Equity","167’415’643","60.15","167’415’642.91","615’793","271.87","Sweden","Nasdaq Stockholm","SEK"
"USD","USD CASH","Cash and/or Derivatives","Cash","-22’190’240","-0.58","-22’190’239.59","-22’190’239","100.00","United States","-","USD"
`;

const SPANISH_STYLE = `Número,Nombre de la posición,Ticker,ISIN,Acciones,Valor de mercado,% de activos netos
1,Alpha Corp,AAA US,CA13321L1085,3.541.827,$ 322.235.420.00,"14,64%"
2,Beta Trust,B-B CN,CA85210A1049,8.744.183,$ 166.899.611.00,"85,35%"
3,Otros/efectivo, -- , -- , -- ,$ 112.075.00,"0,01%"
`;

describe("parseHoldingsCsv — issuer agnosticism", () => {
  it("reads a ticker-only file and does not mistake Region for the identity", () => {
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
    const alpha = result.holdings.find((h) => h.identity === "TW0002330008");
    expect(alpha?.weight).toBe("0.1551");
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
    const result = parseHoldingsCsv(PREAMBLE_STYLE);
    expect(result.covered).toBe("1.0058");
    expect(result.residual).toBe("-0.0058");
  });

  it("folds an issuer's own catch-all bucket", () => {
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
    for (const csv of [
      TICKER_STYLE,
      COMMA_STYLE,
      PREAMBLE_STYLE,
      SPANISH_STYLE,
    ]) {
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
    expect(result.holdings.find((h) => h.identity === "AAAA")?.name).toBe(
      "Technology",
    );
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

describe("parseAsOfHint", () => {
  it("reads a month name, which is unambiguous", () => {
    expect(parseAsOfHint("15/Jul/2026")?.toISOString()).toBe(
      "2026-07-15T00:00:00.000Z",
    );
  });

  it("reads an ISO date", () => {
    expect(parseAsOfHint("2026-07-15")?.toISOString()).toBe(
      "2026-07-15T00:00:00.000Z",
    );
  });

  it("resolves a numeric date when only one reading is possible", () => {
    expect(parseAsOfHint("14/07/2026")?.toISOString()).toBe(
      "2026-07-14T00:00:00.000Z",
    );
    expect(parseAsOfHint("7/17/2026")?.toISOString()).toBe(
      "2026-07-17T00:00:00.000Z",
    );
  });

  it("refuses to guess when both readings are possible", () => {
    expect(parseAsOfHint("07/08/2026")).toBeNull();
  });

  it("returns null for no hint at all", () => {
    expect(parseAsOfHint(null)).toBeNull();
    expect(parseAsOfHint("as of last Tuesday")).toBeNull();
  });
});

describe("parseHoldingsCsv — ordering", () => {
  it("sorts by weight regardless of the order the issuer shipped", () => {
    const csv = `ISIN code,Name,Weight
US0000000001,Small Co,"1,00%"
US0000000002,Huge Co,"80,00%"
US0000000003,Medium Co,"19,00%"
`;
    const result = parseHoldingsCsv(csv);
    expect(result.holdings.map((h) => h.name)).toEqual([
      "Huge Co",
      "Medium Co",
      "Small Co",
    ]);
  });
});

const COLLIDING_STYLE = `Ticker,Holding name,% of market value,Sector,Region
SAN,Banco Santander SA,20.00%,Financials,ES
SAN,Sanofi SA,10.00%,Health Care,FR
MRK,Merck & Co Inc,30.00%,Health Care,US
MRK,Merck KGaA,5.00%,Health Care,DE
ARRY,Array Technologies Inc,25.00%,Utilities,US
ARRY,Array Technologies Inc,10.00%,Utilities,US
`;

describe("parseHoldingsCsv — a ticker is only unique within its venue", () => {
  it("keeps two companies that share a ticker apart", () => {
    const result = parseHoldingsCsv(COLLIDING_STYLE);
    const santander = result.holdings.find((h) => h.identity === "SAN.ES");
    const sanofi = result.holdings.find((h) => h.identity === "SAN.FR");
    expect(santander?.name).toBe("Banco Santander SA");
    expect(sanofi?.name).toBe("Sanofi SA");
  });

  it("finds the venue column without being told which it is", () => {
    expect(parseHoldingsCsv(COLLIDING_STYLE).qualifier).toBe("Region");
  });

  it("adds up one holding split across two rows in the same venue", () => {
    const result = parseHoldingsCsv(COLLIDING_STYLE);
    expect(result.holdings.find((h) => h.identity === "ARRY.US")?.weight).toBe(
      "0.35",
    );
  });

  it("leaves every identity unique, which is what the database requires", () => {
    const ids = parseHoldingsCsv(COLLIDING_STYLE).holdings.map(
      (h) => h.identity,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("needs no venue for an ISIN file: an ISIN carries its own country", () => {
    expect(parseHoldingsCsv(COMMA_STYLE).qualifier).toBeNull();
  });

  it("adds no venue when tickers do not collide", () => {
    expect(parseHoldingsCsv(TICKER_STYLE).qualifier).toBeNull();
    expect(
      parseHoldingsCsv(TICKER_STYLE).holdings.map((h) => h.identity),
    ).toContain("AAAA");
  });

  it("still accounts for every scrap of weight after folding", () => {
    const { covered, residual } = parseHoldingsCsv(COLLIDING_STYLE);
    expect(Number(covered) + Number(residual)).toBeCloseTo(1, 10);
  });
});

// Shape: an export pretty-printed into aligned columns, which puts a space
// between the delimiter and the opening quote. A CSV reader only treats a field
// as quoted when the quote sits flush against the comma, so the quotes come back
// as part of every value.
const PADDED_STYLE = `\uFEFF
Ticker      , Name                        , Weight (%), Location
"AAAA"      , "ALPHA CORP"                , "30.00"   , "United States"
"CCCC"      , "GAMMA INC"                 , "25.00"   , "United States"
"BBBB"      , "BETA AB"                   , "20.00"   , "Sweden"
"6526"      , "DELTA KK"                  , "15.00"   , "Japan"
"6526"      , "EPSILON CORP"              , "9.96"    , "Taiwan"
`;

describe("parseHoldingsCsv — exports that have been reformatted", () => {
  it("survives padded columns and the loose quoting they cause", () => {
    const result = parseHoldingsCsv(PADDED_STYLE);
    expect(result.columns.identity).toBe("Ticker");
    expect(result.holdings).toHaveLength(5);
  });

  it("does not leave quotes inside an identity", () => {
    // Left alone this produced `AAAA."United States"`, which is a venue no other
    // file will ever agree with.
    const result = parseHoldingsCsv(PADDED_STYLE);
    expect(result.holdings.map((h) => h.identity).sort()).toEqual([
      "6526.JP",
      "6526.TW",
      "AAAA.US",
      "BBBB.SE",
      "CCCC.US",
    ]);
  });

  it("does not leave quotes inside a name", () => {
    const result = parseHoldingsCsv(PADDED_STYLE);
    expect(result.holdings[0]?.name).toBe("ALPHA CORP");
  });

  it("keeps a quote that is part of the data", () => {
    // Only a WRAPPING pair is removed, and only when both ends match.
    const csv = `Ticker,Name,Weight (%)
AAAA,ALPHA 12" PIPE CO,60.00
BBBB,BETA CORP,40.00
`;
    const result = parseHoldingsCsv(csv);
    expect(result.holdings.find((h) => h.identity === "AAAA")?.name).toBe(
      'ALPHA 12" PIPE CO',
    );
  });
});

describe("parseHoldingsCsv — shapes other people's issuers will bring", () => {
  it("reads a semicolon-delimited file, which is what European Excel writes", () => {
    const csv = `ISIN;Nombre;Peso
US67066G1040;NVIDIA Corp;4,45%
US0378331005;Apple Inc;3,98%
US5949181045;Microsoft Corp;91,57%
`;
    expect(parseHoldingsCsv(csv).holdings).toHaveLength(3);
  });

  it("reads a tab-delimited file", () => {
    const csv = "ISIN\tName\tWeight\nUS67066G1040\tNVIDIA Corp\t40%\nUS0378331005\tApple Inc\t60%\n";
    expect(parseHoldingsCsv(csv).holdings).toHaveLength(2);
  });

  it("reads weights published as fractions rather than percentages", () => {
    // The two cannot be confused: a percentage column summing to 1 would be a
    // fund that is one percent invested, and a fraction column summing to 100
    // would be a hundred times its own size.
    const csv = `ISIN,Name,Weight
US67066G1040,NVIDIA Corp,0.4
US0378331005,Apple Inc,0.6
`;
    const result = parseHoldingsCsv(csv);
    expect(result.weightScale).toBe("1");
    expect(result.holdings[0]?.weight).toBe("0.6");
  });

  it("still reads percentages, which is what most issuers publish", () => {
    const csv = `ISIN,Name,Weight
US67066G1040,NVIDIA Corp,40
US0378331005,Apple Inc,60
`;
    const result = parseHoldingsCsv(csv);
    expect(result.weightScale).toBe("100");
    expect(result.holdings[0]?.weight).toBe("0.6");
  });

  it("drops a trailing total row, which would otherwise double the column", () => {
    // A TOTAL line makes the weights sum to two hundred, so nothing looks like a
    // weight and the whole file is rejected.
    const csv = `ISIN,Name,Weight
US67066G1040,NVIDIA Corp,40.00%
US0378331005,Apple Inc,60.00%
,TOTAL,100.00%
`;
    const result = parseHoldingsCsv(csv);
    expect(result.holdings).toHaveLength(2);
  });

  it("keeps the last row when it is a holding, not a total", () => {
    // A fund's smallest holding is also a last row. The trailing row is only
    // dropped when dropping it turns an unreadable file into a readable one.
    const csv = `ISIN,Name,Weight
US67066G1040,NVIDIA Corp,40.00%
US0378331005,Apple Inc,35.00%
US5949181045,Microsoft Corp,25.00%
`;
    expect(parseHoldingsCsv(csv).holdings).toHaveLength(3);
  });

  it("reads Windows line endings", () => {
    const csv = "ISIN,Name,Weight\r\nUS67066G1040,NVIDIA Corp,40%\r\nUS0378331005,Apple Inc,60%\r\n";
    expect(parseHoldingsCsv(csv).holdings).toHaveLength(2);
  });

  it("keeps accented names intact", () => {
    const csv = `ISIN,Name,Weight
FR0000120578,Sanofi Société Anonyme,50%
DE0007236101,Siemens Aktiengesellschaft,50%
`;
    expect(parseHoldingsCsv(csv).holdings.map((h) => h.name)).toContain(
      "Sanofi Société Anonyme",
    );
  });
});
