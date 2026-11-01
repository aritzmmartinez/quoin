import Decimal from "decimal.js";

import { isDecimalString } from "~/core/domain";

import { CsvFileError } from "../csv";
import { krakenRowRef, type KrakenParsedRow } from "./row";

export interface BalanceMismatch {
  asset: string;
  wallet: string;
  date: string;
}

export class KrakenBalanceMismatchError extends Error {
  constructor(
    readonly asset: string,
    readonly wallet: string,
    readonly date: string,
  ) {
    super(
      `The ${asset} balance in ${wallet} on ${date} does not follow from the rows before it; nothing was imported`,
    );
    this.name = "KrakenBalanceMismatchError";
  }
}

export function findBalanceMismatch(
  rows: readonly KrakenParsedRow[],
): BalanceMismatch | null {
  const held = new Map<string, Decimal>();
  for (const row of rows) {
    if (
      ![row.amount || "0", row.fee || "0", row.balance].every(isDecimalString)
    ) {
      throw new CsvFileError("invalid-number", null, krakenRowRef(row));
    }
    const key = `${row.asset}\u0000${row.wallet}`;
    const movement = new Decimal(row.amount || "0").minus(row.fee || "0");
    const balance = new Decimal(row.balance);
    const before = held.get(key);
    if (before !== undefined && !before.plus(movement).equals(balance)) {
      return {
        asset: row.asset,
        wallet: row.wallet,
        date: `${row.time} UTC`,
      };
    }
    held.set(key, balance);
  }
  return null;
}
