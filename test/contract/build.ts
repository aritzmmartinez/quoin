import Decimal from "decimal.js";

import type { FxRate } from "../../app/core/ports";

export { eventsOf } from "./portfolio-contract";

export type Row = Record<string, unknown>;

export function ledger() {
  let seq = 0;
  const next = (): number => (seq += 1);
  return {
    trade(
      type: "BUY" | "SELL",
      instrumentId: string,
      ts: string,
      quantity: string,
      grossAmount: string,
      extra: Row = {},
    ): Row {
      const n = next();
      return {
        id: `e-${n}`,
        ts,
        type,
        instrumentId,
        quantity,
        price: new Decimal(grossAmount).div(quantity).toFixed(),
        grossAmount,
        fees: "0",
        currency: "EUR",
        account: "test",
        source: "TEST",
        externalId: `x-${n}`,
        ...extra,
      };
    },
    dividend(
      instrumentId: string,
      ts: string,
      grossAmount: string,
      taxWithheld: string,
      extra: Row = {},
    ): Row {
      const n = next();
      return {
        id: `e-${n}`,
        ts,
        type: "DIVIDEND",
        instrumentId,
        grossAmount,
        taxWithheld,
        currency: "EUR",
        account: "test",
        source: "TEST",
        externalId: `x-${n}`,
        ...extra,
      };
    },
  };
}

export const usd = (fxDate: string, fxRate: string): Row => ({
  currency: "USD",
  fxSource: "ECB",
  fxRate,
  fxDirection: "QUOTE_PER_BASE",
  fxDate,
});

export const rate = (quote: string, day: string, value: string): FxRate => ({
  base: "EUR",
  quote,
  day,
  rate: value,
  source: "ECB",
});

export function at(value: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        node !== null && typeof node === "object"
          ? (node as Record<string, unknown>)[key]
          : undefined,
      value,
    );
}

const BOUNDARY_MARGIN = new Decimal("1e-9");

export function assertClearOfRounding(
  value: Decimal.Value | null,
  label: string,
): void {
  if (value === null) return;
  const micro = new Decimal(value).times(1e6);
  const fraction = micro.minus(micro.floor());
  if (fraction.minus(0.5).abs().times(1e-6).lt(BOUNDARY_MARGIN)) {
    throw new Error(`${label} = ${value} is too close to a rounding boundary`);
  }
}

export function contractJson(
  contract: string,
  description: string,
  cases: readonly unknown[],
): string {
  return `${JSON.stringify(
    { contract, version: 1, description, cases },
    null,
    2,
  )}
`;
}
