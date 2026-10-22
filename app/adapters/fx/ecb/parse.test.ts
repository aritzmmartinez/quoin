import { describe, it, expect } from "vitest";

import { parseEcbCsv } from "./parse";

const HEADER =
  "KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE";

const row = (day: string, rate: string, currency = "USD") =>
  `EXR.D.${currency}.EUR.SP00.A,D,${currency},EUR,SP00,A,${day},${rate}`;

const csv = (...rows: string[]) => [HEADER, ...rows].join("\n") + "\n";

describe("parseEcbCsv", () => {
  it("reads each day's rate exactly as printed, units of the currency per euro", () => {
    const body = csv(row("2026-04-01", "1.2345"), row("2026-04-02", "1.2"));
    const usd = { source: "ECB", base: "EUR", quote: "USD" };

    expect(parseEcbCsv(body, "USD")).toEqual([
      { ...usd, day: "2026-04-01", rate: "1.2345" },
      { ...usd, day: "2026-04-02", rate: "1.2" },
    ]);
  });

  it("has no rate for Good Friday or Easter Monday, and keeps Maundy Thursday", () => {
    const days = parseEcbCsv(
      csv(
        row("2026-04-01", "1.2001"),
        row("2026-04-02", "1.2002"),
        row("2026-04-07", "1.2007"),
      ),
      "USD",
    ).map((rate) => rate.day);

    expect(days).toEqual(["2026-04-01", "2026-04-02", "2026-04-07"]);
  });

  it("keeps Christmas Eve and New Year's Eve across the Christmas closing", () => {
    const days = parseEcbCsv(
      csv(
        row("2025-12-24", "1.2024"),
        row("2025-12-29", "1.2029"),
        row("2025-12-31", "1.2031"),
        row("2026-01-02", "1.2102"),
      ),
      "USD",
    ).map((rate) => rate.day);

    expect(days).toEqual([
      "2025-12-24",
      "2025-12-29",
      "2025-12-31",
      "2026-01-02",
    ]);
  });

  it("returns nothing for the empty body of a range with no data", () => {
    expect(parseEcbCsv("", "USD")).toEqual([]);
  });

  it("sorts the days whatever order they arrive in", () => {
    const days = parseEcbCsv(
      csv(row("2026-04-02", "1.2002"), row("2026-04-01", "1.2001")),
      "USD",
    ).map((rate) => rate.day);

    expect(days).toEqual(["2026-04-01", "2026-04-02"]);
  });

  it.each(["FREQ", "CURRENCY", "CURRENCY_DENOM", "TIME_PERIOD", "OBS_VALUE"])(
    "refuses a file without %s instead of reading it as empty",
    (column) => {
      const header = HEADER.split(",")
        .map((name) => (name === column ? "OTHER" : name))
        .join(",");
      expect(() =>
        parseEcbCsv(`${header}\n${row("2026-04-01", "1.2001")}\n`, "USD"),
      ).toThrow(column);
    },
  );

  it("reads a header with no rows under it as no data", () => {
    expect(parseEcbCsv(`${HEADER}\n`, "USD")).toEqual([]);
  });

  it("refuses a row for another currency than the one asked for", () => {
    expect(() =>
      parseEcbCsv(csv(row("2026-04-01", "0.8001", "GBP")), "USD"),
    ).toThrow(/currency GBP/);
  });

  it("refuses a rate quoted against another denominator", () => {
    const line = "EXR.D.USD.GBP.SP00.A,D,USD,GBP,SP00,A,2026-04-01,1.2001";
    expect(() => parseEcbCsv(csv(line), "USD")).toThrow(/denominator GBP/);
  });

  it("refuses a frequency other than daily", () => {
    const line = "EXR.M.USD.EUR.SP00.A,M,USD,EUR,SP00,A,2026-04,1.2001";
    expect(() => parseEcbCsv(csv(line), "USD")).toThrow(/frequency M/);
  });

  it("skips a closing day the ECB printed with no rate, as it did until 2012", () => {
    const days = parseEcbCsv(
      csv(
        row("2001-12-24", "0.8801"),
        row("2001-12-25", ""),
        row("2001-12-26", ""),
        row("2001-12-27", "0.8827"),
      ),
      "USD",
    ).map((rate) => rate.day);

    expect(days).toEqual(["2001-12-24", "2001-12-27"]);
  });

  it("still checks the rest of a row that has no rate", () => {
    expect(() => parseEcbCsv(csv(row("2001-12-25", "", "GBP")), "USD")).toThrow(
      /currency GBP/,
    );
  });

  it.each([" ", "NaN", "-1.2", "0", "1,2", "1.2e3"])(
    "refuses the rate %j",
    (rate) => {
      expect(() => parseEcbCsv(csv(row("2026-04-01", rate)), "USD")).toThrow();
    },
  );

  it("refuses a day that is not a calendar date", () => {
    expect(() =>
      parseEcbCsv(csv(row("2026-02-30", "1.2001")), "USD"),
    ).toThrow();
  });
});
