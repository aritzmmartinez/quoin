import Decimal from "decimal.js";

import { Money } from "~/core/domain";

const LOCALE = "es-ES";

/**
 * Format a base-currency (EUR) amount held as a decimal string.
 *
 * Reuses Money's own formatter so the app never re-implements currency rules.
 * Note: es-ES + CLDR omit the thousands separator for 4-digit integers
 * (e.g. "1234,56 €"), which is expected, not a bug.
 */
export function formatMoney(value: string, maximumFractionDigits = 2): string {
  return Money.fromString(value).format({ maximumFractionDigits });
}

/**
 * Format a share/unit quantity (not a currency). Supports fractional shares and
 * crypto precision (up to 8 decimals) without a currency symbol.
 */
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
  /** Formatted absolute value with an explicit +/− (typographic minus U+2212). */
  text: string;
  sign: MoneySign;
}

/**
 * Format a signed amount for P&L display: the sign is explicit and separated from
 * the magnitude so the caller can color it (positive/negative/zero) consistently.
 */
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

/** Format an ISO date string as a short es-ES date, e.g. "1 jul 2026". */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/**
 * Format a "YYYY-MM" period as an es-ES month, e.g. "2026-07" -> "julio de 2026".
 *
 * Built and formatted in UTC on purpose: the period is a label, not an instant,
 * and constructing it in local time would render the previous month for anyone
 * west of Greenwich.
 */
export function formatPeriod(period: string): string {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return new Intl.DateTimeFormat(LOCALE, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** Format a 0..1 fraction as an es-ES percentage, e.g. "0.1732" -> "17,3 %". */
export function formatPercent(
  fraction: string,
  maximumFractionDigits = 1,
  options: { floorNonZero?: boolean } = {},
): string {
  const value = new Decimal(fraction);
  const formatter = new Intl.NumberFormat(LOCALE, {
    style: "percent",
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits,
  });
  if (
    options.floorNonZero &&
    value.gt(0) &&
    value
      .mul(100)
      .toDecimalPlaces(maximumFractionDigits, Decimal.ROUND_HALF_UP)
      .isZero()
  ) {
    const smallest = new Decimal(10).pow(-(maximumFractionDigits + 2));
    return `<${formatter.format(smallest.toNumber())}`;
  }
  return formatter.format(value.toNumber());
}

/**
 * Human relative time in Spanish, e.g. "hace 5 minutos", "hace 1 día".
 * `now` is injectable for deterministic tests.
 */
export function formatRelativeTime(
  iso: string,
  now: Date = new Date(),
): string {
  const diffMs = new Date(iso).getTime() - now.getTime(); // negative in the past
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  const abs = Math.abs(diffMs);
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  if (abs < HOUR) return rtf.format(Math.round(diffMs / MIN), "minute");
  if (abs < DAY) return rtf.format(Math.round(diffMs / HOUR), "hour");
  return rtf.format(Math.round(diffMs / DAY), "day");
}
