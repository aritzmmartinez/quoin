import Decimal from "decimal.js";

import type { TradeRepublicRow } from "./row";

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function magnitude(value: string): Decimal {
  const trimmed = value.trim();
  return trimmed === "" ? new Decimal(0) : new Decimal(trimmed).abs();
}

function investedBy(saveback: TradeRepublicRow): Decimal {
  return magnitude(saveback.amount).minus(magnitude(saveback.tax));
}

function isCandidate(
  saveback: TradeRepublicRow,
  buy: TradeRepublicRow,
): boolean {
  const from = new Date(saveback.datetime).getTime();
  const at = new Date(buy.datetime).getTime();
  if (at < from || at - from > WINDOW_MS) return false;
  if (saveback.symbol !== "" && buy.symbol !== saveback.symbol) return false;
  return magnitude(buy.amount).equals(investedBy(saveback));
}

function isSaveback(row: TradeRepublicRow): boolean {
  return row.category === "CASH" && row.type === "BENEFITS_SAVEBACK";
}

function isBuy(row: TradeRepublicRow): boolean {
  return row.category === "TRADING" && row.type === "BUY";
}

export function pairSavebacks(
  rows: readonly TradeRepublicRow[],
): Map<string, string> {
  const unique = new Map<string, TradeRepublicRow>();
  for (const row of rows) {
    if (!unique.has(row.transaction_id)) unique.set(row.transaction_id, row);
  }
  const savebacks = [...unique.values()].filter(isSaveback);
  const buys = [...unique.values()].filter(isBuy);

  const candidates = new Map<string, string[]>();
  const claims = new Map<string, number>();
  for (const saveback of savebacks) {
    const found = buys
      .filter((buy) => isCandidate(saveback, buy))
      .map((buy) => buy.transaction_id);
    candidates.set(saveback.transaction_id, found);
    for (const id of found) claims.set(id, (claims.get(id) ?? 0) + 1);
  }

  const pairs = new Map<string, string>();
  for (const [saveback, found] of candidates) {
    const [only] = found;
    if (found.length === 1 && only !== undefined && claims.get(only) === 1) {
      pairs.set(saveback, only);
    }
  }
  return pairs;
}
