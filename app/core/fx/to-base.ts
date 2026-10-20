import Decimal from "decimal.js";

import { Money, type LedgerEvent } from "../domain";

type AmountField = "grossAmount" | "fees" | "taxWithheld";

export const BASE_DECIMALS = 2;

export function toBase<E extends LedgerEvent>(
  event: E,
  field: Extract<keyof E, AmountField>,
): Money {
  const amount = event[field] as string;
  const { fxSource, fxRate, fxDirection } = event;
  if (
    fxSource === undefined ||
    fxSource === "IDENTITY" ||
    fxRate == null ||
    fxDirection == null
  ) {
    return Money.fromString(amount);
  }

  const value = new Decimal(amount);
  const converted =
    fxDirection === "QUOTE_PER_BASE"
      ? value.dividedBy(fxRate)
      : value.times(fxRate);
  return Money.fromString(
    converted.toDecimalPlaces(BASE_DECIMALS, Decimal.ROUND_HALF_UP).toFixed(),
  );
}
