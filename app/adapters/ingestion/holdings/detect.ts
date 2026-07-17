import Papa from "papaparse";
import Decimal from "decimal.js";

import {
  looksLikeIsin,
  looksLikeTicker,
  looksNumeric,
  parseLooseNumber,
} from "./numbers";

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
    const cells = (data[i] ?? []).map((c) => (c ?? "").trim());
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
    if (header !== "") row[header] = (cells[i] ?? "").trim();
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
): { column: string; sum: Decimal } | null {
  let best: { column: string; sum: Decimal } | null = null;

  for (const header of headers) {
    const values = rows
      .map((row) => parseLooseNumber(row[header] ?? ""))
      .filter((v): v is Decimal => v !== null);

    // A weight column is numeric nearly everywhere; a stray "-" is fine.
    if (values.length < rows.length * 0.8) continue;

    const sum = values.reduce((acc, v) => acc.plus(v), new Decimal(0));
    if (sum.lt(90) || sum.gt(101)) continue;

    if (best === null || sum.minus(100).abs().lt(best.sum.minus(100).abs())) {
      best = { column: header, sum };
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

  const tickerish = headers.filter(
    (h) => share(h, looksLikeTicker) > 0.6 && uniqueness(h, rows) > 0.5,
  );
  const hinted = tickerish.find((h) => TICKER_HINTS.test(h));
  if (hinted) return { column: hinted, kind: "TICKER" };

  const [first] = tickerish;
  return first ? { column: first, kind: "TICKER" } : null;
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
