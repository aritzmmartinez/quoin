import Decimal from "decimal.js";

import {
  detectAsOfHint,
  detectColumns,
  detectQualifierColumn,
  detectTable,
  type ColumnMap,
  type IdentityKind,
} from "./detect";
import { looksLikeIsin, parseLooseNumber } from "./numbers";

export interface ParsedHolding {
  identity: string;
  identityKind: IdentityKind;
  name: string;
  weight: string;
}

export interface ParsedHoldings {
  columns: ColumnMap;
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
  const table = detectTable(csv);
  if (!table) {
    throw new HoldingsParseError(
      "No header row found: the file does not look like a holdings table.",
    );
  }

  const detected = detectColumns(table);
  const columns = { ...detected, ...override } as ColumnMap;

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
    if (!hasUsableIdentity(identity, columns.identityKind) || weight.lte(0)) {
      foldedRows += 1;
      continue;
    }

    covered = covered.plus(weight);

    const venue = qualifier ? (row[qualifier] ?? "").trim() : "";
    const key =
      columns.identityKind === "ISIN"
        ? identity.toUpperCase()
        : venue === ""
          ? identity
          : `${identity}.${venue}`;

    const existing = byIdentity.get(key);
    if (existing) {
      existing.weight = new Decimal(existing.weight)
        .plus(weight.div(100))
        .toString();
      continue;
    }

    byIdentity.set(key, {
      identity: key,
      identityKind: columns.identityKind,
      name: (row[columns.name] ?? "").trim() || identity,
      weight: weight.div(100).toString(),
    });
  }

  const holdings = [...byIdentity.values()];

  if (holdings.length === 0) {
    throw new HoldingsParseError(
      "No holdings with a usable identity were found.",
    );
  }

  const coveredFraction = covered.div(100);
  const residual = new Decimal(1).minus(coveredFraction);

  holdings.sort((a, b) =>
    new Decimal(b.weight).comparedTo(new Decimal(a.weight)),
  );

  return {
    columns,
    qualifier,
    headers: table.headers,
    asOfHint: detectAsOfHint(table.preamble),
    holdings,
    covered: coveredFraction.toString(),
    residual: residual.toString(),
    foldedRows,
  };
}
