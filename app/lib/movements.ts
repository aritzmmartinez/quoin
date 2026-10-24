import Decimal from "decimal.js";

import {
  isInKind,
  isSwapLeg,
  type Instrument,
  type LedgerEvent,
  type LedgerEventType,
} from "~/core/domain";
import { hasRate, toBase } from "~/core/fx";

export interface MovementRow {
  id: string;
  t: string;
  type: LedgerEventType;
  inKind: boolean;
  swap: boolean;
  instrumentId: string | null;
  instrumentName: string | null;
  quantity: string | null;
  price: string | null;
  costs: string | null;
  amount: string | null;
  currency: string;
  noRate: boolean;
}

const OUTFLOWS: ReadonlySet<LedgerEventType> = new Set<LedgerEventType>([
  "BUY",
  "WITHDRAWAL",
]);

function inBase<E extends LedgerEvent>(
  event: E,
  field: Parameters<typeof toBase<E>>[1],
): Decimal {
  const result = toBase(event, field);
  return result.ok ? new Decimal(result.amount.toString()) : new Decimal(0);
}

function signedAmount(event: LedgerEvent, costs: Decimal): Decimal {
  const gross = inBase(event, "grossAmount");
  const signed = OUTFLOWS.has(event.type) ? gross.negated() : gross;
  return signed.minus(costs);
}

function costsOf(event: LedgerEvent): Decimal {
  if (event.type === "BUY" || event.type === "SELL")
    return inBase(event, "fees");
  if (event.type === "DIVIDEND") return inBase(event, "taxWithheld");
  return new Decimal(0);
}

export function toMovementRows(
  events: readonly LedgerEvent[],
  instruments: readonly Instrument[],
): MovementRow[] {
  const byId = new Map(instruments.map((i) => [i.id, i]));

  return [...events]
    .sort((a, b) => b.ts.getTime() - a.ts.getTime())
    .map((event) => {
      const rated = hasRate(event);
      const costs = costsOf(event);
      const isTrade = event.type === "BUY" || event.type === "SELL";
      const instrumentId = "instrumentId" in event ? event.instrumentId : null;

      let quantity: string | null = null;
      let price: string | null = null;
      if (isTrade) {
        const qty = new Decimal(event.quantity);
        quantity = qty.toFixed();
        price =
          qty.isZero() || !rated
            ? null
            : inBase(event, "grossAmount").div(qty).toString();
      }

      return {
        id: event.id,
        t: event.ts.toISOString(),
        type: event.type,
        inKind: isInKind(event),
        swap: isSwapLeg(event),
        instrumentId,
        instrumentName: instrumentId
          ? (byId.get(instrumentId)?.name ?? instrumentId)
          : null,
        quantity,
        price,
        costs: rated ? costs.toFixed(2) : null,
        amount: rated ? signedAmount(event, costs).toFixed(2) : null,
        currency: event.currency,
        noRate: !rated,
      };
    });
}

export function netCashFlow(rows: readonly MovementRow[]): string {
  return rows
    .reduce(
      (sum, r) =>
        r.amount === null || r.swap ? sum : sum.plus(new Decimal(r.amount)),
      new Decimal(0),
    )
    .toFixed(2);
}
