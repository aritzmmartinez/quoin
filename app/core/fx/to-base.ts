import Decimal from "decimal.js";

import { Amount, BASE_CURRENCY, Money, type LedgerEvent } from "../domain";

type AmountField = "grossAmount" | "fees" | "taxWithheld";

export const BASE_DECIMALS = 2;

export type BaseAmount =
  | { ok: true; amount: Money }
  | { ok: false; reason: "no-rate" };

export function hasRate(event: LedgerEvent): boolean {
  if ((event.fxSource ?? "IDENTITY") === "IDENTITY") {
    return event.currency === BASE_CURRENCY;
  }
  return (
    event.currency !== BASE_CURRENCY &&
    event.fxRate != null &&
    event.fxDirection != null
  );
}

export function toBase<E extends LedgerEvent>(
  event: E,
  field: Extract<keyof E, AmountField>,
): BaseAmount {
  if (!hasRate(event)) return { ok: false, reason: "no-rate" };

  const amount = event[field] as string;
  const { fxSource, fxRate, fxDirection } = event;
  if ((fxSource ?? "IDENTITY") === "IDENTITY" || !fxRate || !fxDirection) {
    return { ok: true, amount: Money.fromString(amount) };
  }

  const converted = Amount.of(amount, event.currency).inBase(
    fxRate,
    fxDirection,
  );
  return {
    ok: true,
    amount: Money.fromString(
      new Decimal(converted.toString())
        .toDecimalPlaces(BASE_DECIMALS, Decimal.ROUND_HALF_UP)
        .toFixed(),
    ),
  };
}

export function baseOf<E extends LedgerEvent>(
  event: E,
  field: Extract<keyof E, AmountField>,
): Money {
  const result = toBase(event, field);
  if (!result.ok) {
    throw new Error(
      `Ledger entry ${event.id} has no rate to ${BASE_CURRENCY}; pass the ledger through bookable() first`,
    );
  }
  return result.amount;
}

function isTrade(event: LedgerEvent): boolean {
  return event.type === "BUY" || event.type === "SELL";
}

export function unconvertibleInstrumentIds(
  events: readonly LedgerEvent[],
): string[] {
  const ids = new Set<string>();
  for (const event of events) {
    if (isTrade(event) && "instrumentId" in event && !hasRate(event)) {
      ids.add(event.instrumentId);
    }
  }
  return [...ids].sort();
}

export function bookable(events: readonly LedgerEvent[]): LedgerEvent[] {
  const excluded = new Set(unconvertibleInstrumentIds(events));
  return events.filter(
    (event) =>
      hasRate(event) &&
      !("instrumentId" in event && excluded.has(event.instrumentId)),
  );
}
