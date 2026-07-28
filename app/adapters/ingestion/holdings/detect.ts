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
  /** Header cells, in order. Offered to the UI so a person can override. */
  headers: string[];
  rows: Record<string, string>[];
  /** Cells above the header — where issuers hide the as-of date. */
  preamble: string[][];
}

/**
 * Find the header row and read the table under it.
 *
 * Issuers put a BOM, a title line and a non-breaking space above the header, and
 * no two agree on how many. Rather than a skip count per issuer, the header is
 * the first row with at least three non-empty, non-numeric cells: a title line
 * ("Fund Holdings as of", "15/Jul/2026") has two, a spacer has one, and a data
 * row would have numbers in it.
 */
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

/**
 * Undo a pair of wrapping quotes the CSV reader left behind.
 *
 * A quoted field is only recognised when its opening quote sits flush against
 * the delimiter. Some exports are pretty-printed with the columns padded into
 * alignment — `, "United States"` — which puts a space in the way, so the reader
 * hands back the quotes as part of the value and `"United States"` stops looking
 * like a country. Cheap to undo, and the alternative is a file that parses into
 * plausible nonsense.
 */
function unquote(cell: string): string {
  const text = cell.trim();
  return text.length >= 2 && text.startsWith('"') && text.endsWith('"')
    ? text.slice(1, -1).trim()
    : text;
}

/** Blank or repeated header cells would silently collapse rows onto each other. */
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

/**
 * The weight column is the one whose values sum to about 100.
 *
 * This is the whole trick, and it beats matching header names: it does not care
 * about the issuer, the language ("Weight", "% de activos netos", "% of market
 * value") or the number format, and it doubles as verification. If nothing sums
 * to ~100, the file is not a holdings table and saying so is better than
 * importing half of one.
 */
export function detectWeightColumn(
  headers: readonly string[],
  rows: readonly Record<string, string>[],
): { column: string; sum: Decimal; scale: Decimal } | null {
  let best: { column: string; sum: Decimal; scale: Decimal } | null = null;

  for (const header of headers) {
    const values = rows
      .map((row) => parseLooseNumber(row[header] ?? ""))
      .filter((v): v is Decimal => v !== null);

    // A weight column is numeric nearly everywhere; a stray "-" is fine.
    if (values.length < rows.length * 0.8) continue;

    const sum = values.reduce((acc, v) => acc.plus(v), new Decimal(0));

    // Most issuers publish percentages, some publish plain fractions. The two
    // cannot be confused: a percentage column summing to 1 would mean a fund
    // that is one percent invested, and a fraction column summing to 100 would
    // mean a hundred times its own size.
    const scale = sum.gte(90) && sum.lte(101)
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

/**
 * An identity column is mostly unique: roughly one row per instrument. That is
 * the structural signal, and it separates a real Ticker column from a Region or
 * Market Currency column whose codes look exactly like tickers — "US" repeats
 * across half a global fund, "NVDA" appears once.
 *
 * The bar is deliberately low. A real ticker column is not perfectly unique: the
 * cash and FX rows at the bottom of a fund repeat currency codes (EUR, KRW, BRL)
 * and dragged one real file down to 0.75. The columns being excluded sit around
 * 0.01, so there is no need to cut fine.
 */
function uniqueness(header: string, rows: readonly Record<string, string>[]): number {
  if (rows.length === 0) return 0;
  const values = rows.map((row) => (row[header] ?? "").trim()).filter((v) => v !== "");
  return values.length === 0 ? 0 : new Set(values).size / values.length;
}

/**
 * Prefer a real ISIN. Vanguard and iShares ship ticker-only files, so the
 * fallback matters — but a ticker is a weaker identity that only merges with
 * other tickers, which is why leaf aliasing exists.
 */
export function detectIdentityColumn(
  headers: readonly string[],
  rows: readonly Record<string, string>[],
): { column: string; kind: IdentityKind } | null {
  const share = (header: string, test: (v: string) => boolean): number =>
    rows.length === 0
      ? 0
      : rows.filter((row) => test(row[header] ?? "")).length / rows.length;

  for (const header of headers) {
    if (share(header, looksLikeIsin) > 0.5) return { column: header, kind: "ISIN" };
  }

  const tickerish = headers.filter((h) => share(h, looksLikeTicker) > 0.6);

  // A column called "Ticker" that holds tickers is the ticker column, however
  // many of them repeat. Uniqueness is a fallback for guessing blind, not a
  // veto: a fund where the same ticker means two companies in two countries
  // drags that score down, and that is exactly the file that needs it most.
  const hinted = tickerish.find((h) => TICKER_HINTS.test(h));
  if (hinted) return { column: hinted, kind: "TICKER" };

  const guessed = tickerish.find((h) => uniqueness(h, rows) > 0.5);
  return guessed ? { column: guessed, kind: "TICKER" } : null;
}

const NAME_HINTS = /name|nombre|description|descripci|holding|posici|security|titre|wertpapier/i;

/**
 * The only column detected by its header, because there is no structural signal
 * that separates a name from a sector. If the hint misses, the longest text
 * column is the better guess than nothing — and the UI lets a person fix it.
 */
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
    if (best === null || length > best.length) best = { column: header, length };
  }
  return best?.column ?? null;
}

const DATE_HINTS = [
  /(\d{1,2})[/-]([A-Za-z]{3})[/-](\d{4})/,
  /(\d{4})-(\d{2})-(\d{2})/,
  /(\d{1,2})[/.](\d{1,2})[/.](\d{4})/,
];

/**
 * Issuers stamp the as-of date in the title line. It is a hint, not a
 * guarantee — the ambiguity between d/m/y and m/d/y is unresolvable from the
 * string alone, so this only reports what it saw and a person confirms it.
 */
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

/**
 * Drop a trailing total row, but only when it is the thing standing in the way.
 *
 * Plenty of exports end with a TOTAL line, which doubles the weight column and
 * makes it sum to two hundred — so nothing looks like a weight and the whole
 * file is rejected. Rather than guess at which rows are totals, this asks the
 * question that matters: does removing the last row turn an unreadable file
 * into a readable one? If it does not, the row stays, because a fund's smallest
 * holding is also a last row.
 */
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
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  ene: 0, abr: 3, ago: 7, dic: 11,
};

/**
 * Turn an as-of hint into a date, or admit it cannot.
 *
 * "15/Jul/2026" and "2026-07-15" are unambiguous. "07/08/2026" is not — the same
 * six digits mean August in Madrid and July in New York, and nothing in the file
 * says which. Rather than guess and be silently wrong by a month, that returns
 * null and the caller falls back to today, which is at least honestly wrong.
 */
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
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  }

  const numeric = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(hint.trim());
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = Number(numeric[3]);
    // Only decidable when one of the two cannot be a month.
    if (first > 12 && second <= 12) return new Date(Date.UTC(year, second - 1, first));
    if (second > 12 && first <= 12) return new Date(Date.UTC(year, first - 1, second));
    return null;
  }

  return null;
}

const QUALIFIER_HINTS = /region|country|pa[ií]s|location|exchange|bolsa|venue|plaza/i;

/**
 * Find the column that says WHERE a ticker trades.
 *
 * A ticker is only an identity within its venue. In one real global fund, SAN is
 * Banco Santander in Madrid and Sanofi in Paris; MRK is Merck & Co in New York
 * and Merck KGaA in Germany; 6526 is Socionext in Tokyo and Airoha in Taipei.
 * Ninety collisions in a single file, and merging any of them would claim a
 * holding that does not exist. This is the same reason a quote symbol is IBE.MC
 * and not IBE.
 *
 * Detected structurally: the qualifier is whichever repeating column removes the
 * most collisions. ISIN files need none — an ISIN already carries its country.
 */
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
      // A qualifier repeats: it names a place, and places are coarser than
      // companies. The bar only has to exclude a column that is itself an
      // identity — a tighter one would depend on file size, since the same
      // Region column scores 0.01 across four thousand rows and 0.67 across six.
      uniqueness(h, rows) < 0.9 &&
      rows.every((row) => !looksNumeric(row[h] ?? "")),
  );

  let best: { column: string; clashes: number; country: number } | null = null;
  for (const column of candidates) {
    const clashes = collisions(column);
    if (clashes >= baseline) continue;

    // A column of countries beats one of exchange names even when both
    // disambiguate. Countries normalise across issuers and languages — "US",
    // "United States" and "Estados Unidos" all fold to US — whereas "NASDAQ"
    // and "New York Stock Exchange Inc." never will. Picking the normalisable
    // one is what lets two issuers' files agree on an identity.
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
