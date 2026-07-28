import Papa from "papaparse";
import Decimal from "decimal.js";

import {
  looksLikeIsin,
  looksLikeTicker,
  looksNumeric,
  parseLooseNumber,
} from "./numbers";
import { countryShare, normaliseVenue } from "./venue";

export type IdentityKind = "ISIN" | "TICKER";

export interface ColumnMap {
  identity: string;
  identityKind: IdentityKind;
  name: string;
  weight: string;
}

export interface DetectedTable {
  headers: string[];
  rows: Record<string, string>[];
  preamble: string[][];
}

export function detectTable(csv: string): DetectedTable | null {
  const { data } = Papa.parse<string[]>(csv.replace(/^\uFEFF/, ""), {
    header: false,
    skipEmptyLines: "greedy",
  });

  const preamble: string[][] = [];

  for (let i = 0; i < data.length; i++) {
    const cells = (data[i] ?? []).map((c) => unquote(c ?? ""));
    const filled = cells.filter((c) => c !== "" && c !== "\u00a0");

    const isHeader =
      filled.length >= 3 && filled.every((c) => !looksNumeric(c));

    if (!isHeader) {
      if (filled.length > 0) preamble.push(filled);
      continue;
    }

    const body = data.slice(i + 1);
    const headers = dedupeHeaders(cells);
    const rows = body
      .map((cells) => toRecord(headers, cells))
      .filter((row) => Object.values(row).some((v) => v !== ""));

    return { headers: headers.filter((h) => h !== ""), rows, preamble };
  }

  return null;
}

function unquote(cell: string): string {
  const text = cell.trim();
  return text.length >= 2 && text.startsWith('"') && text.endsWith('"')
    ? text.slice(1, -1).trim()
    : text;
}

function dedupeHeaders(cells: string[]): string[] {
  const seen = new Map<string, number>();
  return cells.map((cell, i) => {
    const base = cell === "" ? `column_${i + 1}` : cell;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function toRecord(headers: string[], cells: string[]): Record<string, string> {
  const row: Record<string, string> = {};
  headers.forEach((header, i) => {
    if (header !== "") row[header] = unquote(cells[i] ?? "");
  });
  return row;
}

export function detectWeightColumn(
  headers: readonly string[],
  rows: readonly Record<string, string>[],
): { column: string; sum: Decimal; scale: Decimal } | null {
  let best: { column: string; sum: Decimal; scale: Decimal } | null = null;

  for (const header of headers) {
    const values = rows
      .map((row) => parseLooseNumber(row[header] ?? ""))
      .filter((v): v is Decimal => v !== null);

    if (values.length < rows.length * 0.8) continue;

    const sum = values.reduce((acc, v) => acc.plus(v), new Decimal(0));

    const scale =
      sum.gte(90) && sum.lte(101)
        ? new Decimal(100)
        : sum.gte(0.9) && sum.lte(1.01)
          ? new Decimal(1)
          : null;
    if (scale === null) continue;

    const distance = sum.div(scale).minus(1).abs();
    const bestDistance = best ? best.sum.div(best.scale).minus(1).abs() : null;
    if (bestDistance === null || distance.lt(bestDistance)) {
      best = { column: header, sum, scale };
    }
  }

  return best;
}

const TICKER_HINTS = /ticker|symbol|s[ií]mbolo|c[oó]digo|code/i;

function uniqueness(
  header: string,
  rows: readonly Record<string, string>[],
): number {
  if (rows.length === 0) return 0;
  const values = rows
    .map((row) => (row[header] ?? "").trim())
    .filter((v) => v !== "");
  return values.length === 0 ? 0 : new Set(values).size / values.length;
}

export function detectIdentityColumn(
  headers: readonly string[],
  rows: readonly Record<string, string>[],
): { column: string; kind: IdentityKind } | null {
  const share = (header: string, test: (v: string) => boolean): number =>
    rows.length === 0
      ? 0
      : rows.filter((row) => test(row[header] ?? "")).length / rows.length;

  for (const header of headers) {
    if (share(header, looksLikeIsin) > 0.5)
      return { column: header, kind: "ISIN" };
  }

  const tickerish = headers.filter((h) => share(h, looksLikeTicker) > 0.6);

  const hinted = tickerish.find((h) => TICKER_HINTS.test(h));
  if (hinted) return { column: hinted, kind: "TICKER" };

  const guessed = tickerish.find((h) => uniqueness(h, rows) > 0.5);
  return guessed ? { column: guessed, kind: "TICKER" } : null;
}

const NAME_HINTS =
  /name|nombre|description|descripci|holding|posici|security|titre|wertpapier/i;

export function detectNameColumn(
  headers: readonly string[],
  rows: readonly Record<string, string>[],
  exclude: readonly string[],
): string | null {
  const candidates = headers.filter((h) => !exclude.includes(h));

  const hinted = candidates.find((h) => NAME_HINTS.test(h));
  if (hinted) return hinted;

  let best: { column: string; length: number } | null = null;
  for (const header of candidates) {
    const values = rows.map((row) => row[header] ?? "").filter((v) => v !== "");
    if (values.length === 0) continue;
    if (values.some(looksNumeric)) continue;
    const length = values.reduce((a, v) => a + v.length, 0) / values.length;
    if (best === null || length > best.length)
      best = { column: header, length };
  }
  return best?.column ?? null;
}

const DATE_HINTS = [
  /(\d{1,2})[/-]([A-Za-z]{3})[/-](\d{4})/,
  /(\d{4})-(\d{2})-(\d{2})/,
  /(\d{1,2})[/.](\d{1,2})[/.](\d{4})/,
];

export function detectAsOfHint(preamble: readonly string[][]): string | null {
  for (const cells of preamble) {
    for (const cell of cells) {
      for (const pattern of DATE_HINTS) {
        const match = pattern.exec(cell);
        if (match) return match[0];
      }
    }
  }
  return null;
}

export function withoutTotalRow(table: DetectedTable): DetectedTable {
  if (table.rows.length < 2) return table;
  if (detectWeightColumn(table.headers, table.rows)) return table;

  const trimmed = table.rows.slice(0, -1);
  if (!detectWeightColumn(table.headers, trimmed)) return table;

  return { ...table, rows: trimmed };
}

export function detectColumns(table: DetectedTable): ColumnMap | null {
  const weight = detectWeightColumn(table.headers, table.rows);
  if (!weight) return null;

  const identity = detectIdentityColumn(table.headers, table.rows);
  if (!identity) return null;

  const name = detectNameColumn(table.headers, table.rows, [
    weight.column,
    identity.column,
  ]);
  if (!name) return null;

  return {
    identity: identity.column,
    identityKind: identity.kind,
    name,
    weight: weight.column,
  };
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
  ene: 0,
  abr: 3,
  ago: 7,
  dic: 11,
};

export function parseAsOfHint(hint: string | null): Date | null {
  if (!hint) return null;

  const named = /^(\d{1,2})[/-]([A-Za-z]{3})[/-](\d{4})$/.exec(hint.trim());
  if (named) {
    const month = MONTHS[named[2]!.toLowerCase()];
    if (month === undefined) return null;
    return new Date(Date.UTC(Number(named[3]), month, Number(named[1])));
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hint.trim());
  if (iso) {
    return new Date(
      Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])),
    );
  }

  const numeric = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(hint.trim());
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = Number(numeric[3]);
    if (first > 12 && second <= 12)
      return new Date(Date.UTC(year, second - 1, first));
    if (second > 12 && first <= 12)
      return new Date(Date.UTC(year, first - 1, second));
    return null;
  }

  return null;
}

const QUALIFIER_HINTS =
  /region|country|pa[ií]s|location|exchange|bolsa|venue|plaza/i;

export function detectQualifierColumn(
  headers: readonly string[],
  rows: readonly Record<string, string>[],
  identityColumn: string,
  exclude: readonly string[],
): string | null {
  const collisions = (qualifier: string | null): number => {
    const seen = new Set<string>();
    let clashes = 0;
    for (const row of rows) {
      const identity = (row[identityColumn] ?? "").trim();
      if (identity === "") continue;
      const key =
        qualifier === null
          ? identity
          : `${identity}\u0000${normaliseVenue(row[qualifier] ?? "")}`;
      if (seen.has(key)) clashes += 1;
      seen.add(key);
    }
    return clashes;
  };

  const baseline = collisions(null);
  if (baseline === 0) return null;

  const candidates = headers.filter(
    (h) =>
      h !== identityColumn &&
      !exclude.includes(h) &&
      uniqueness(h, rows) < 0.9 &&
      rows.every((row) => !looksNumeric(row[h] ?? "")),
  );

  let best: { column: string; clashes: number; country: number } | null = null;
  for (const column of candidates) {
    const clashes = collisions(column);
    if (clashes >= baseline) continue;

    const country = countryShare(rows.map((row) => row[column] ?? ""));

    if (
      best === null ||
      clashes < best.clashes ||
      (clashes === best.clashes && country > best.country) ||
      (clashes === best.clashes &&
        country === best.country &&
        QUALIFIER_HINTS.test(column) &&
        !QUALIFIER_HINTS.test(best.column))
    ) {
      best = { column, clashes, country };
    }
  }

  return best?.column ?? null;
}
