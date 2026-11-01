import Papa from "papaparse";

import { CsvFileError } from "./decode";
import type { RowRef } from "./discard";

export { CsvFileError, decodeCsv } from "./decode";

export interface CsvRecord {
  raw: Record<string, string>;
  position: number;
  malformed: boolean;
}

export interface CsvRecords {
  missing: string[];
  records: CsvRecord[];
}

export function readCsv(csv: string, columns: readonly string[]): CsvRecords {
  const { data, errors, meta } = Papa.parse<Record<string, string>>(csv, {
    header: true,
    delimiter: ",",
    skipEmptyLines: "greedy",
  });
  const fields = meta.fields ?? [];
  const missing = columns.filter((column) => !fields.includes(column));
  if (
    missing.length === columns.length ||
    errors.some((error) => error.type !== "FieldMismatch")
  ) {
    throw new CsvFileError("unparseable");
  }

  const bad = new Set(errors.map((error) => (error.row ?? -1) + 1));
  const records = data.flatMap((raw, index): CsvRecord[] => {
    const position = index + 1;
    const malformed = bad.has(position);
    return malformed || (raw.type ?? "").trim() !== ""
      ? [{ raw, position, malformed }]
      : [];
  });
  return { missing, records };
}

export function requireColumns(csv: CsvRecords): void {
  const [missing] = csv.missing;
  if (missing !== undefined) throw new CsvFileError("missing-column", missing);
}

export function rowRef(
  externalId: string | undefined,
  position: number,
  date: string | undefined,
  type: string | undefined,
): RowRef {
  const id = externalId?.trim() ?? "";
  return {
    externalId: id === "" ? null : id,
    position: id === "" ? position : null,
    date: date ?? null,
    type: type ?? null,
  };
}
