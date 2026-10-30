/**
 * The currency every projection reports in. Positions quoted elsewhere are
 * converted to it at an ECB rate (core/fx) or left unvalued — never mixed.
 */
export const BASE_CURRENCY = "EUR";

import Decimal from "decimal.js";

Decimal.set({ precision: 40, toExpNeg: -30, toExpPos: 40 });

const DECIMAL_SHAPE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE]([+-]?\d+))?$/;
export const MAX_DECIMAL_EXPONENT = 1000;

/**
 * The one written form of a decimal everything stored or parsed must have.
 * decimal.js alone also reads `0x1F`, `0b11` and `1_000`, which the mobile
 * client does not, and an exponent with no bound.
 */
export function isDecimalString(value: string): boolean {
  const match = DECIMAL_SHAPE.exec(value);
  if (match === null) return false;
  const exponent = match[1];
  return (
    exponent === undefined || Math.abs(Number(exponent)) <= MAX_DECIMAL_EXPONENT
  );
}

export class Money {
  private constructor(private readonly amount: Decimal) {}

  static zero(): Money {
    return new Money(new Decimal(0));
  }

  static fromString(value: string): Money {
    if (!isDecimalString(value)) {
      throw new Error(`Invalid money value: "${value}"`);
    }
    return new Money(new Decimal(value));
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
    return this.amount.lt(0);
  }

  isPositive(): boolean {
    return this.amount.gt(0);
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
