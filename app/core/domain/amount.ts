import type { FxDirection } from "./ledger";
import { BASE_CURRENCY, Money } from "./money";

export class Amount {
  private constructor(
    readonly value: Money,
    readonly currency: string,
  ) {}

  static of(value: string, currency: string): Amount {
    return new Amount(Money.fromString(value), currency);
  }

  isBase(): boolean {
    return this.currency === BASE_CURRENCY;
  }

  inBase(rate: string, direction: FxDirection): Money {
    if (this.isBase()) {
      throw new Error(`An amount in ${BASE_CURRENCY} is not converted`);
    }
    return direction === "QUOTE_PER_BASE"
      ? this.value.divideBy(rate)
      : this.value.scaleBy(rate);
  }
}
