import Decimal from "decimal.js";

import {
  detectAsOfHint,
  detectColumns,
  detectQualifierColumn,
  detectTable,
  detectWeightColumn,
  withoutTotalRow,
  type ColumnMap,
  type IdentityKind,
} from "./detect";
import { looksLikeIsin, parseLooseNumber } from "./numbers";
import { normaliseVenue } from "./venue";

export interface ParsedHolding {
  identity: string;
  identityKind: IdentityKind;
  name: string;
  /** Fraction of the fund, as a decimal string: 4.4503% -> "0.044503". */
  weight: string;
}

export interface ParsedHoldings {
  columns: ColumnMap;
  /** 100 when the issuer publishes percentages, 1 when it publishes fractions. */
  weightScale: string;
  /**
   * Column used to tell same-ticker companies apart, when one was needed. Null
   * for ISIN files, which need none.
   */
  qualifier: string | null;
  /** Every header, so the UI can offer an override for each detected column. */
  headers: string[];
  asOfHint: string | null;
  holdings: ParsedHolding[];
  /** Sum of the holdings' weights, as a fraction. */
  covered: string;
  /**
   * 1 − covered: cash, derivatives, rounding and any row without a usable
   * identity. Becomes the fund's UNRESOLVED leaf. Never dropped, never spread.
   */
  residual: string;
  /** Rows folded into the residual rather than kept as leaves. */
  foldedRows: number;
}

export class HoldingsParseError extends Error {}

/** Rows an issuer uses for "everything else" carry no identity to speak of. */
function hasUsableIdentity(raw: string, kind: IdentityKind): boolean {
  const text = raw.trim();
  if (text === "" || /^-+$/.test(text)) return false;
  return kind === "ISIN" ? looksLikeIsin(text) : true;
}

/**
 * Parse any issuer's holdings export.
 *
 * Deliberately has no per-issuer branch: the shape is always a table with an
 * identity, a name and a weight, and everything else — header offset, language,
 * number format, thousands separator — is detected. A seventh issuer should need
 * no code.
 */
export function parseHoldingsCsv(
  csv: string,
  override?: Partial<ColumnMap>,
): ParsedHoldings {
  const parsed = detectTable(csv);
  const table = parsed ? withoutTotalRow(parsed) : null;
  if (!table) {
    throw new HoldingsParseError(
      "No header row found: the file does not look like a holdings table.",
    );
  }

  const detected = detectColumns(table);
  const columns = { ...detected, ...override } as ColumnMap;

  // Re-measured rather than taken from detection, because an override can point
  // at a different column with a different scale.
  const scale =
    detectWeightColumn([columns.weight], table.rows)?.scale ?? new Decimal(100);

  if (!columns.identity || !columns.weight || !columns.name) {
    throw new HoldingsParseError(
      "Could not tell which columns hold the identity, the name and the weight. No column adds up to about 100%, so this may not be a holdings file.",
    );
  }

  // A ticker is only unique within its venue, so find the column that says which.
  const qualifier =
    columns.identityKind === "TICKER"
      ? detectQualifierColumn(table.headers, table.rows, columns.identity, [
          columns.name,
          columns.weight,
        ])
      : null;

  const byIdentity = new Map<string, ParsedHolding>();
  let covered = new Decimal(0);
  let total = new Decimal(0);
  let foldedRows = 0;

  for (const row of table.rows) {
    const weight = parseLooseNumber(row[columns.weight] ?? "");
    if (weight === null) {
      foldedRows += 1;
      continue;
    }
    total = total.plus(weight);

    const identity = (row[columns.identity] ?? "").trim();
    // Cash, FX forwards and an issuer's own "Otros/efectivo" bucket land here.
    // They are real weight with no leaf, so they belong in the residual.
    if (!hasUsableIdentity(identity, columns.identityKind) || weight.lte(0)) {
      foldedRows += 1;
      continue;
    }

    covered = covered.plus(weight);

    const venue = qualifier ? normaliseVenue(row[qualifier] ?? "") : "";
    const key =
      columns.identityKind === "ISIN"
        ? identity.toUpperCase()
        : venue === ""
          ? identity
          : `${identity}.${venue}`;

    // Same identity in the same venue on two lines is one holding split across
    // two rows, so its weights add. This is the only case where merging is safe:
    // once the venue is part of the key, SAN in Madrid can no longer swallow SAN
    // in Paris.
    const existing = byIdentity.get(key);
    if (existing) {
      existing.weight = new Decimal(existing.weight).plus(weight.div(scale)).toString();
      continue;
    }

    byIdentity.set(key, {
      identity: key,
      identityKind: columns.identityKind,
      name: (row[columns.name] ?? "").trim() || identity,
      weight: weight.div(scale).toString(),
    });
  }

  const holdings = [...byIdentity.values()];

  if (holdings.length === 0) {
    throw new HoldingsParseError("No holdings with a usable identity were found.");
  }

  // An issuer whose identified holdings cover 99.48% is telling us the other
  // 0.52% is cash, derivatives and rounding: that is the residual.
  //
  // The residual can be NEGATIVE, and that is not an error: a fund carrying
  // negative cash (-0.58% in one real file) has equity holdings summing to more
  // than 100%. Clamping it to zero would quietly discard the fact that the fund
  // is slightly geared. Either way the weights still sum to exactly 1.
  const coveredFraction = covered.div(scale);
  const residual = new Decimal(1).minus(coveredFraction);

  // Sorted by weight, because the issuer's order is not a contract: one ships by
  // weight, another could ship by sector, and a preview showing twelve arbitrary
  // rows verifies nothing. The heaviest constituents are what a person checks.
  holdings.sort((a, b) => new Decimal(b.weight).comparedTo(new Decimal(a.weight)));

  return {
    columns,
    weightScale: scale.toString(),
    qualifier,
    headers: table.headers,
    asOfHint: detectAsOfHint(table.preamble),
    holdings,
    covered: coveredFraction.toString(),
    residual: residual.toString(),
    foldedRows,
  };
}
