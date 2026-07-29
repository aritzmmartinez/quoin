import Decimal from "decimal.js";

import type {
  Instrument,
  LedgerEvent,
  LedgerEventType,
  Sleeve,
} from "~/core/domain";

export interface MovementRow {
  id: string;
  t: string;
  type: LedgerEventType;
  instrumentId: string | null;
  instrumentName: string | null;
  sleeve: Sleeve | null;
  quantity: string | null;
  price: string | null;
  costs: string;
  amount: string;
}

const OUTFLOWS: ReadonlySet<LedgerEventType> = new Set<LedgerEventType>([
  "BUY",
  "WITHDRAWAL",
]);

function signedAmount(event: LedgerEvent, costs: Decimal): Decimal {
  const gross = new Decimal(event.grossAmount);
  const signed = OUTFLOWS.has(event.type) ? gross.negated() : gross;
  return signed.minus(costs).mul(event.fxToBase);
}

function costsOf(event: LedgerEvent): Decimal {
  if (event.type === "BUY" || event.type === "SELL")
    return new Decimal(event.fees);
  if (event.type === "DIVIDEND") return new Decimal(event.taxWithheld);
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
      const costs = costsOf(event);
      const isTrade = event.type === "BUY" || event.type === "SELL";
      const instrumentId = "instrumentId" in event ? event.instrumentId : null;

      let quantity: string | null = null;
      let price: string | null = null;
      if (isTrade) {
        const qty = new Decimal(event.quantity);
        quantity = qty.toFixed();
        price = qty.isZero()
          ? null
          : new Decimal(event.grossAmount)
              .mul(event.fxToBase)
              .div(qty)
              .toString();
      }

      return {
        id: event.id,
        t: event.ts.toISOString(),
        type: event.type,
        instrumentId,
        instrumentName: instrumentId
          ? (byId.get(instrumentId)?.name ?? instrumentId)
          : null,
        sleeve: "sleeve" in event ? (event.sleeve ?? null) : null,
        quantity,
        price,
        costs: costs.mul(event.fxToBase).toFixed(2),
        amount: signedAmount(event, costs).toFixed(2),
      };
    });
}

export function netCashFlow(rows: readonly MovementRow[]): string {
  return rows
    .reduce((sum, r) => sum.plus(new Decimal(r.amount)), new Decimal(0))
    .toFixed(2);
}
