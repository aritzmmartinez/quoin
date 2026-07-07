import Decimal from "decimal.js";

// Configure decimal.js once: high precision, and avoid exponential notation for
// the value ranges money realistically takes.
Decimal.set({ precision: 40, toExpNeg: -30, toExpPos: 40 });

/**
 * Money — immutable value object for exact monetary amounts.
 *
 * Correctness rule: money is built from decimal strings and operated on with
 * decimal.js, NEVER as a `number`. There is deliberately no constructor from
 * `number` so a float can't leak in. It is currency-agnostic: currency is tracked
 * on the ledger entry / position, not inside every amount, to keep arithmetic simple
 * while everything is settled in one base currency (EUR).
 */
export class Money {
  private constructor(private readonly amount: Decimal) {}

  static zero(): Money {
    return new Money(new Decimal(0));
  }

  /** Build from a canonical decimal string (the storage/transit format). */
  static fromString(value: string): Money {
    let parsed: Decimal;
    try {
      parsed = new Decimal(value);
    } catch {
      throw new Error(`Invalid money value: "${value}"`);
    }
    if (!parsed.isFinite()) {
      throw new Error(`Money must be finite, got "${value}"`);
    }
    return new Money(parsed);
  }

  /** Internal constructor from an already-computed Decimal. */
  private static fromDecimal(value: Decimal): Money {
    return new Money(value);
  }

  add(other: Money): Money {
    return Money.fromDecimal(this.amount.plus(other.amount));
  }

  subtract(other: Money): Money {
    return Money.fromDecimal(this.amount.minus(other.amount));
  }

  /** Scale by a plain decimal factor (e.g. a quantity or an fx rate). */
  scaleBy(factor: Decimal.Value): Money {
    return Money.fromDecimal(this.amount.times(factor));
  }

  /** Divide by a plain decimal divisor (e.g. a quantity) to get a per-unit amount. */
  divideBy(divisor: Decimal.Value): Money {
    const d = new Decimal(divisor);
    if (d.isZero()) {
      throw new Error("Money division by zero");
    }
    return Money.fromDecimal(this.amount.dividedBy(d));
  }

  negate(): Money {
    return Money.fromDecimal(this.amount.negated());
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  isNegative(): boolean {
    return this.amount.isNegative();
  }

  isPositive(): boolean {
    return this.amount.isPositive();
  }

  /** -1, 0 or 1. */
  compare(other: Money): number {
    return this.amount.comparedTo(other.amount);
  }

  equals(other: Money): boolean {
    return this.amount.equals(other.amount);
  }

  /** Canonical decimal string — the storage/transit representation. */
  toString(): string {
    return this.amount.toFixed();
  }

  /**
   * Lossy conversion to a JS number. Only for rendering libraries that require a
   * number (charts). NEVER use for money arithmetic.
   */
  toNumber(): number {
    return this.amount.toNumber();
  }

  /** Locale-formatted display. Defaults to es-ES / EUR. Rounds for presentation only. */
  format(options?: {
    locale?: string;
    currency?: string;
    maximumFractionDigits?: number;
  }): string {
    const {
      locale = "es-ES",
      currency = "EUR",
      maximumFractionDigits = 2,
    } = options ?? {};
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits,
    }).format(this.amount.toNumber());
  }
}
