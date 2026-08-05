import * as XLSX from "xlsx";

import { HoldingsParseError, parseHoldingsCsv } from "./parse";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_ROWS = 200_000;

function sheetsToCsv(buffer: ArrayBuffer): { sheet: string; csv: string }[] {
  const workbook = XLSX.read(new Uint8Array(buffer), {
    type: "array",
    sheetRows: MAX_ROWS,
  });
  return workbook.SheetNames.map((sheet) => ({
    sheet,
    csv: XLSX.utils.sheet_to_csv(workbook.Sheets[sheet]!, { blankrows: false }),
  }));
}

/**
 * Turn a holdings workbook into the one CSV that is its holdings table.
 *
 * Issuers publish .xlsx, not .csv, so a person importing a real export would
 * otherwise have to convert it by hand first. Rather than a second parser, each
 * sheet is rendered to CSV and handed to the CSV parser untouched. sheet_to_csv
 * applies the cell's display format, so a weight stored as the fraction 0.1508
 * comes out "15.09%" and the parser's scale detection reads it with no change.
 *
 * A workbook has many sheets and only one is the holdings; the right one is the
 * one that parses. Trying each and keeping the sole success rejects a
 * disclaimer or cover sheet for free, and refuses the ambiguous case rather
 * than guessing which of two holdings-shaped sheets was meant.
 */
export function xlsxToHoldingsCsv(buffer: ArrayBuffer): string {
  if (buffer.byteLength > MAX_BYTES) {
    throw new HoldingsParseError(
      "This file is too large to be a holdings export.",
    );
  }

  const holdings = sheetsToCsv(buffer).filter((sheet) => {
    try {
      parseHoldingsCsv(sheet.csv);
      return true;
    } catch {
      return false;
    }
  });

  if (holdings.length === 0) {
    throw new HoldingsParseError(
      "No sheet in this workbook looks like a holdings table.",
    );
  }
  if (holdings.length > 1) {
    const names = holdings.map((sheet) => sheet.sheet).join(", ");
    throw new HoldingsParseError(
      `More than one sheet looks like holdings (${names}); open the file and keep only the holdings sheet.`,
    );
  }

  return holdings[0]!.csv;
}
