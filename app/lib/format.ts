import Decimal from "decimal.js";

import { Money } from "~/core/domain";

import { intlTag, type Locale } from "./locale";

export type MoneySign = "positive" | "negative" | "zero";

export interface SignedMoney {
  text: string;
  sign: MoneySign;
}

export interface Format {
  formatMoney: (value: string, maximumFractionDigits?: number) => string;
  formatQuantity: (value: string, maximumFractionDigits?: number) => string;
  formatSignedMoney: (
    value: string,
    maximumFractionDigits?: number,
  ) => SignedMoney;
  formatDate: (iso: string) => string;
  formatTimeTick: (
    timestamp: number,
    unit: "day" | "month",
    withYear?: boolean,
  ) => string;
  formatPeriod: (period: string) => string;
  formatPercent: (
    fraction: string,
    maximumFractionDigits?: number,
    options?: { floorNonZero?: boolean },
  ) => string;
  formatRelativeTime: (iso: string, now?: Date) => string;
  formatClock: (now?: Date) => string;
  tag: string;
}

export function createFormat(locale: Locale): Format {
  const tag = intlTag(locale);

  function formatMoney(value: string, maximumFractionDigits = 2): string {
    return Money.fromString(value).format({
      maximumFractionDigits,
      locale: tag,
    });
  }

  function formatQuantity(value: string, maximumFractionDigits = 8): string {
    return new Intl.NumberFormat(tag, { maximumFractionDigits }).format(
      new Decimal(value).toNumber(),
    );
  }

  function formatSignedMoney(
    value: string,
    maximumFractionDigits = 2,
  ): SignedMoney {
    const money = Money.fromString(value);
    const magnitude = (money.isNegative() ? money.negate() : money).format({
      maximumFractionDigits,
      locale: tag,
    });

    if (money.isZero()) return { text: magnitude, sign: "zero" };
    if (money.isNegative()) return { text: `−${magnitude}`, sign: "negative" };
    return { text: `+${magnitude}`, sign: "positive" };
  }

  function formatDate(iso: string): string {
    return new Intl.DateTimeFormat(tag, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  }

  function formatTimeTick(
    timestamp: number,
    unit: "day" | "month",
    withYear = false,
  ): string {
    return new Intl.DateTimeFormat(tag, {
      ...(unit === "day"
        ? { day: "numeric", month: "short" }
        : { month: "short" }),
      ...(withYear ? { year: "2-digit" as const } : {}),
    }).format(new Date(timestamp));
  }

  /**
   * Format a "YYYY-MM" period as a month, e.g. "2026-07" -> "julio de 2026".
   *
   * Built and formatted in UTC on purpose: the period is a label, not an instant,
   * and constructing it in local time would render the previous month for anyone
   * west of Greenwich.
   */
  function formatPeriod(period: string): string {
    const [year, month] = period.split("-").map(Number);
    if (!year || !month) return period;
    return new Intl.DateTimeFormat(tag, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, 1)));
  }

  function formatPercent(
    fraction: string,
    maximumFractionDigits = 1,
    options: { floorNonZero?: boolean } = {},
  ): string {
    const value = new Decimal(fraction);
    const formatter = new Intl.NumberFormat(tag, {
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
   * Human relative time, e.g. "hace 5 minutos" / "5 minutes ago".
   * `now` is injectable for deterministic tests.
   */
  function formatRelativeTime(iso: string, now: Date = new Date()): string {
    const diffMs = new Date(iso).getTime() - now.getTime(); // negative in the past
    const rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
    const abs = Math.abs(diffMs);
    const MIN = 60_000;
    const HOUR = 60 * MIN;
    const DAY = 24 * HOUR;

    if (abs < HOUR) return rtf.format(Math.round(diffMs / MIN), "minute");
    if (abs < DAY) return rtf.format(Math.round(diffMs / HOUR), "hour");
    return rtf.format(Math.round(diffMs / DAY), "day");
  }

  const clock = new Intl.DateTimeFormat(tag, {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
  });

  function formatClock(now: Date = new Date()): string {
    return clock.format(now);
  }

  return {
    formatMoney,
    formatQuantity,
    formatSignedMoney,
    formatDate,
    formatTimeTick,
    formatPeriod,
    formatPercent,
    formatRelativeTime,
    formatClock,
    tag,
  };
}

const DAY_IN_MADRID = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayInMadrid(now: Date = new Date()): string {
  return DAY_IN_MADRID.format(now);
}
