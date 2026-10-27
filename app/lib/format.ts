import Decimal from "decimal.js";

import { BASE_CURRENCY, Money } from "~/core/domain";

import { intlTag, type Locale } from "./locale";

export type MoneySign = "positive" | "negative" | "zero";

export interface SignedMoney {
  text: string;
  sign: MoneySign;
}

export interface Format {
  formatMoney: (value: string, maximumFractionDigits?: number) => string;
  formatAmount: (value: string, currency: string) => string;
  formatPrice: (value: string, currency?: string) => string;
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
    options?: { floorNonZero?: boolean; signed?: boolean },
  ) => string;
  formatRelativeTime: (iso: string, now?: Date) => string;
  formatClock: (now?: Date) => string;
  tag: string;
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function exact(value: string): `${number}` {
  return new Decimal(value).toFixed() as `${number}`;
}

export function createFormat(locale: Locale, zone: string): Format {
  const tag = intlTag(locale);

  function formatMoney(value: string, maximumFractionDigits = 2): string {
    return Money.fromString(value).format({
      maximumFractionDigits,
      locale: tag,
    });
  }

  function formatAmount(value: string, currency: string): string {
    if (currency === BASE_CURRENCY) return formatMoney(value);
    const number = new Intl.NumberFormat(tag, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(new Decimal(value).toNumber());
    return `${number} ${currency}`;
  }

  function formatPrice(value: string, currency = BASE_CURRENCY): string {
    const price = new Decimal(value);
    if (price.isZero() || price.abs().gte(1)) {
      return formatAmount(value, currency);
    }
    const digits = { minimumSignificantDigits: 2, maximumSignificantDigits: 4 };
    if (currency === BASE_CURRENCY) {
      return new Intl.NumberFormat(tag, {
        style: "currency",
        currency,
        ...digits,
      }).format(exact(value));
    }
    return `${new Intl.NumberFormat(tag, digits).format(exact(value))} ${currency}`;
  }

  function formatQuantity(value: string, maximumFractionDigits = 10): string {
    return new Intl.NumberFormat(tag, { maximumFractionDigits }).format(
      exact(value),
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

  /** An instant is shown in `zone`; a bare `YYYY-MM-DD` is a day already, read in UTC like a period. */
  function formatDate(iso: string): string {
    return new Intl.DateTimeFormat(tag, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: CALENDAR_DATE.test(iso) ? "UTC" : zone,
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
      timeZone: zone,
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
    options: { floorNonZero?: boolean; signed?: boolean } = {},
  ): string {
    const value = new Decimal(fraction);
    const formatter = new Intl.NumberFormat(tag, {
      style: "percent",
      minimumFractionDigits: maximumFractionDigits,
      maximumFractionDigits,
      ...(options.signed ? { signDisplay: "exceptZero" as const } : {}),
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
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
  });

  function formatClock(now: Date = new Date()): string {
    return clock.format(now);
  }

  return {
    formatMoney,
    formatAmount,
    formatPrice,
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
