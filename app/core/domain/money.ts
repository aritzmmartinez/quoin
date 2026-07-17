/**
 * The currency every projection reports in. Positions quoted elsewhere are
 * converted to it (once FX exists) or excluded from valuation — never mixed.
 */
export const BASE_CURRENCY = "EUR";

import Decimal from "decimal.js";

Decimal.set({ precision: 40, toExpNeg: -30, toExpPos: 40 });

export class Money {
  private constructor(private readonly amount: Decimal) {}

  static zero(): Money {
    return new Money(new Decimal(0));
  }

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

  private static fromDecimal(value: Decimal): Money {
    return new Money(value);
  }

  add(other: Money): Money {
    return Money.fromDecimal(this.amount.plus(other.amount));
  }

  subtract(other: Money): Money {
    return Money.fromDecimal(this.amount.minus(other.amount));
  }

  scaleBy(factor: Decimal.Value): Money {
    return Money.fromDecimal(this.amount.times(factor));
  }

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

  compare(other: Money): number {
    return this.amount.comparedTo(other.amount);
  }

  equals(other: Money): boolean {
    return this.amount.equals(other.amount);
  }

  toString(): string {
    return this.amount.toFixed();
  }

  toNumber(): number {
    return this.amount.toNumber();
  }

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
