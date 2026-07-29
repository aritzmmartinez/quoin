import Decimal from "decimal.js";

import {
  dividendEventSchema,
  cashEventSchema,
  instrumentSchema,
  tradeEventSchema,
  type Instrument,
  type InstrumentType,
  type LedgerEvent,
} from "~/core/domain";

import type { TradeRepublicRow } from "./row";

import type { MappedItem } from "../ingest";

function abs(value: string): string {
  return new Decimal(value).abs().toFixed();
}

function absOrZero(value: string): string {
  const trimmed = value.trim();
  return trimmed === "" ? "0" : abs(trimmed);
}

function assetClassToType(assetClass: string): InstrumentType {
  switch (assetClass) {
    case "FUND":
      return "ETF";
    case "STOCK":
      return "STOCK";
    case "CRYPTO":
      return "CRYPTO";
    case "SYNTHETIC":
      return "ETF";
    default:
      throw new Error(`Unknown asset class: "${assetClass}"`);
  }
}

function toInstrument(row: TradeRepublicRow): Instrument {
  return instrumentSchema.parse({
    id: row.symbol,
    name: row.name,
    type: assetClassToType(row.asset_class),
    currency: row.currency,
    assetClass: row.asset_class || null,
  });
}

function base(row: TradeRepublicRow) {
  return {
    id: crypto.randomUUID(),
    ts: new Date(row.datetime),
    currency: row.currency,
    fxToBase: "1",
    account: "trade-republic",
    source: "TR_CSV",
    externalId: row.transaction_id,
    note: null,
  };
}

/**
 * Map a Trade Republic row to a domain contribution, or flag it for discard.
 *
 * Card spending is discarded (the CSV is the whole bank account, not just investing).
 * Saveback, corporate actions and any unrecognized type are discarded as "unsupported"
 * so they surface in the import summary instead of being silently mis-booked.
 *
 * Everything imported enters the CORE sleeve — the CSV has no sleeve information, so
 * TRADING reclassification is an explicit manual action later.
 */
export function mapRow(row: TradeRepublicRow): MappedItem {
  switch (`${row.category}|${row.type}`) {
    case "TRADING|BUY":
    case "TRADING|SELL":
      return {
        kind: "domain",
        instrument: toInstrument(row),
        event: tradeEventSchema.parse({
          ...base(row),
          type: row.type,
          instrumentId: row.symbol,
          sleeve: "CORE",
          quantity: abs(row.shares),
          price: row.price,
          grossAmount: abs(row.amount),
          fees: absOrZero(row.fee),
        }),
      };

    case "CASH|DIVIDEND":
      return {
        kind: "domain",
        instrument: toInstrument(row),
        event: dividendEventSchema.parse({
          ...base(row),
          type: "DIVIDEND",
          instrumentId: row.symbol,
          sleeve: "CORE",
          grossAmount: abs(row.amount),
          taxWithheld: absOrZero(row.tax),
        }),
      };

    case "CASH|INTEREST_PAYMENT":
      return {
        kind: "domain",
        instrument: null,
        event: toCash(row, "INTEREST"),
      };

    case "CASH|CUSTOMER_INPAYMENT":
    case "CASH|TRANSFER_INSTANT_INBOUND":
    case "CASH|TRANSFER_DIRECT_DEBIT_INBOUND":
    case "CASH|TRANSFER_INBOUND":
      return {
        kind: "domain",
        instrument: null,
        event: toCash(row, "DEPOSIT"),
      };

    case "CASH|TRANSFER_INSTANT_OUTBOUND":
      return {
        kind: "domain",
        instrument: null,
        event: toCash(row, "WITHDRAWAL"),
      };

    case "CASH|CARD_TRANSACTION":
    case "CASH|CARD_TRANSACTION_INTERNATIONAL":
      return { kind: "discard", reason: "card-spending" };

    default:
      // Saveback, corporate actions, liquidations, and anything unrecognized.
      return { kind: "discard", reason: "unsupported" };
  }
}

function toCash(
  row: TradeRepublicRow,
  type: "DEPOSIT" | "WITHDRAWAL" | "INTEREST",
): LedgerEvent {
  return cashEventSchema.parse({
    ...base(row),
    type,
    grossAmount: abs(row.amount),
  });
}
