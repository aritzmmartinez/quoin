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
import { looksLikeCashRow, looksLikeIsin, parseLooseNumber } from "./numbers";
import { normaliseVenue } from "./venue";

export interface ParsedHolding {
  identity: string;
  identityKind: IdentityKind;
  name: string;
  weight: string;
}

export interface ParsedHoldings {
  columns: ColumnMap;
  weightScale: string;
  qualifier: string | null;
  headers: string[];
  asOfHint: string | null;
  holdings: ParsedHolding[];
  covered: string;
  residual: string;
  foldedRows: number;
}

export class HoldingsParseError extends Error {}

function hasUsableIdentity(raw: string, kind: IdentityKind): boolean {
  const text = raw.trim();
  if (text === "" || /^-+$/.test(text)) return false;
  return kind === "ISIN" ? looksLikeIsin(text) : true;
}

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

  const scale =
    detectWeightColumn([columns.weight], table.rows)?.scale ?? new Decimal(100);

  if (!columns.identity || !columns.weight || !columns.name) {
    throw new HoldingsParseError(
      "Could not tell which columns hold the identity, the name and the weight. No column adds up to about 100%, so this may not be a holdings file.",
    );
  }

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
    const rowName = (row[columns.name] ?? "").trim();

    if (
      !hasUsableIdentity(identity, columns.identityKind) ||
      looksLikeCashRow(identity, rowName) ||
      weight.lte(0)
    ) {
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

    const existing = byIdentity.get(key);
    if (existing) {
      existing.weight = new Decimal(existing.weight)
        .plus(weight.div(scale))
        .toString();
      continue;
    }

    byIdentity.set(key, {
      identity: key,
      identityKind: columns.identityKind,
      name: rowName || identity,
      weight: weight.div(scale).toString(),
    });
  }

  const holdings = [...byIdentity.values()];

  if (holdings.length === 0) {
    throw new HoldingsParseError(
      "No holdings with a usable identity were found.",
    );
  }

  const coveredFraction = covered.div(scale);
  const residual = new Decimal(1).minus(coveredFraction);

  holdings.sort((a, b) =>
    new Decimal(b.weight).comparedTo(new Decimal(a.weight)),
  );

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
