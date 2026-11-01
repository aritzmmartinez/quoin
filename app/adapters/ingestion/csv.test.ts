import { describe, expect, it } from "vitest";

import { CsvFileError, decodeCsv, readCsv } from "./csv";

const refusal = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    if (error instanceof CsvFileError)
      return { reason: error.reason, column: error.column, row: error.row };
    throw error;
  }
  throw new Error("expected a CsvFileError");
};

describe("decodeCsv", () => {
  it("reads UTF-8 and drops a leading BOM", () => {
    const bytes = new TextEncoder().encode("\uFEFFname\nCafé");
    expect(decodeCsv(bytes)).toBe("name\nCafé");
  });

  it("refuses a byte that is not UTF-8 instead of turning it into U+FFFD", () => {
    const latin1 = Uint8Array.from([0x6e, 0x0a, 0x43, 0x61, 0x66, 0xe9]);
    expect(refusal(() => decodeCsv(latin1))).toMatchObject({
      reason: "invalid-encoding",
    });
  });
});

describe("readCsv", () => {
  const COLUMNS = ["id", "type", "amount"];

  it("numbers records among the non-empty ones and flags a wrong field count", () => {
    const read = readCsv(
      "id,type,amount\n\na,BUY,1\n\nb,BUY\nc,,3\nd,SELL,4,extra\n",
      COLUMNS,
    );
    expect(read.missing).toEqual([]);
    expect(
      read.records.map(({ raw, position, malformed }) => [
        raw.id,
        position,
        malformed,
      ]),
    ).toEqual([
      ["a", 1, false],
      ["b", 2, true],
      ["d", 4, true],
    ]);
  });

  it("never guesses the delimiter: a file in ';' finds none of its columns", () => {
    expect(
      refusal(() => readCsv("id;type;amount\na;BUY;1", COLUMNS)),
    ).toMatchObject({ reason: "unparseable" });
  });

  it("refuses an unclosed quote, which can swallow the rest of the file", () => {
    expect(
      refusal(() => readCsv('id,type,amount\n"a,BUY,1\nb,BUY,2', COLUMNS)),
    ).toMatchObject({ reason: "unparseable" });
  });

  it("reports the columns that are missing, for the caller to decide", () => {
    expect(readCsv("id,type\na,BUY", COLUMNS).missing).toEqual(["amount"]);
  });
});
