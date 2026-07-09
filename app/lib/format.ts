import Decimal from "decimal.js";

import { Money } from "~/core/domain";

const LOCALE = "es-ES";

export function formatQuantity(
  value: string,
  maximumFractionDigits = 8,
): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits }).format(
    new Decimal(value).toNumber(),
  );
}

export type MoneySign = "positive" | "negative" | "zero";

export interface SignedMoney {
  text: string;
  sign: MoneySign;
}

export function formatSignedMoney(
  value: string,
  maximumFractionDigits = 2,
): SignedMoney {
  const money = Money.fromString(value);
  const magnitude = (money.isNegative() ? money.negate() : money).format({
    maximumFractionDigits,
  });

  if (money.isZero()) return { text: magnitude, sign: "zero" };
  if (money.isNegative())
    return { text: `\u2212${magnitude}`, sign: "negative" };
  return { text: `+${magnitude}`, sign: "positive" };
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}
