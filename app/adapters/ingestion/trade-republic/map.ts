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

import { cryptoInstrumentId } from "../crypto-id";
import type { MappedItem } from "../ingest";

function abs(value: string): string {
  return new Decimal(value).abs().toFixed();
}

function absOrZero(value: string): string {
  const trimmed = value.trim();
  return trimmed === "" ? "0" : abs(trimmed);
}

const TYPE_OF_ASSET_CLASS: Readonly<Record<string, InstrumentType>> = {
  FUND: "ETF",
  STOCK: "STOCK",
  CRYPTO: "CRYPTO",
  SYNTHETIC: "ETF",
};

function assetClassToType(assetClass: string): InstrumentType | null {
  return Object.hasOwn(TYPE_OF_ASSET_CLASS, assetClass)
    ? (TYPE_OF_ASSET_CLASS[assetClass] ?? null)
    : null;
}

function instrumentIdOf(row: TradeRepublicRow): string | null {
  return row.asset_class === "CRYPTO"
    ? cryptoInstrumentId(row.symbol)
    : row.symbol;
}

function toInstrument(
  row: TradeRepublicRow,
  id: string,
  type: InstrumentType,
): Instrument {
  return instrumentSchema.parse({
    id,
    name: row.name,
    type,
    assetClass: row.asset_class || null,
  });
}

function originals(row: TradeRepublicRow) {
  const amount = row.original_amount?.trim() ?? "";
  const currency = row.original_currency?.trim() ?? "";
  if (amount === "" || currency === "") return {};
  return { originalAmount: abs(amount), originalCurrency: currency };
}

function base(row: TradeRepublicRow) {
  return {
    id: crypto.randomUUID(),
    ts: new Date(row.datetime),
    currency: row.currency,
    ...originals(row),
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
 * A saveback reaching here found no purchase to pair with (`mapSavebackPurchase`
 * handles the ones that did). Corporate actions and any unrecognized type are
 * discarded as "unsupported" so they surface in the import summary instead of
 * being silently mis-booked.
 */
function invalidCryptoCode(row: TradeRepublicRow): MappedItem {
  return {
    kind: "discard",
    reason: "invalid-crypto-code",
    detail: {
      date: row.datetime,
      type: row.type,
      subtype: null,
      instrument: row.symbol || row.name || null,
    },
  };
}

/**
 * A bond, a derivative or any class Quoin does not read yet: the row is set
 * aside by name instead of guessing an instrument type. Only a trade changes a
 * position; a dividend set aside does not.
 */
function unsupportedAssetClass(row: TradeRepublicRow): MappedItem {
  return {
    kind: "discard",
    reason: "unsupported-asset-class",
    detail: {
      date: row.datetime,
      type: row.type,
      subtype: row.asset_class || null,
      instrument: row.name || row.symbol || null,
      affectsPosition: row.category === "TRADING",
    },
  };
}

export function mapRow(row: TradeRepublicRow): MappedItem {
  switch (`${row.category}|${row.type}`) {
    case "TRADING|BUY":
    case "TRADING|SELL": {
      const type = assetClassToType(row.asset_class);
      if (type === null) return unsupportedAssetClass(row);
      const id = instrumentIdOf(row);
      if (id === null) return invalidCryptoCode(row);
      return {
        kind: "domain",
        instrument: toInstrument(row, id, type),
        event: tradeEventSchema.parse({
          ...base(row),
          type: row.type,
          instrumentId: id,
          quantity: abs(row.shares),
          price: row.price,
          grossAmount: abs(row.amount),
          fees: absOrZero(row.fee),
        }),
      };
    }

    case "CASH|DIVIDEND": {
      const type = assetClassToType(row.asset_class);
      if (type === null) return unsupportedAssetClass(row);
      const id = instrumentIdOf(row);
      if (id === null) return invalidCryptoCode(row);
      return {
        kind: "domain",
        instrument: toInstrument(row, id, type),
        event: dividendEventSchema.parse({
          ...base(row),
          type: "DIVIDEND",
          instrumentId: id,
          grossAmount: abs(row.amount),
          taxWithheld: absOrZero(row.tax),
        }),
      };
    }

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

    case "CASH|BENEFITS_SAVEBACK":
      return savebackUnpaired(row);

    case "CASH|CARD_TRANSACTION":
    case "CASH|CARD_TRANSACTION_INTERNATIONAL":
      return { kind: "discard", reason: "card-spending" };

    default:
      return {
        kind: "discard",
        reason: "unsupported",
        detail: {
          date: row.datetime,
          type: row.type,
          subtype: null,
          instrument: row.name || null,
        },
      };
  }
}

function savebackUnpaired(row: TradeRepublicRow): MappedItem {
  return {
    kind: "discard",
    reason: "saveback-unpaired",
    detail: {
      date: row.datetime,
      type: row.type,
      subtype: null,
      instrument: row.name || null,
    },
  };
}

/** A purchase set aside takes its saveback with it, named, never silently. */
export function mapSavebackPurchase(
  buy: TradeRepublicRow,
  saveback: TradeRepublicRow,
): MappedItem[] {
  const purchase = mapRow(buy);
  if (purchase.kind === "discard")
    return [purchase, savebackUnpaired(saveback)];
  if (purchase.kind !== "domain" || purchase.event.type !== "BUY") {
    throw new Error(
      `Saveback ${saveback.transaction_id} paired with a non-buy`,
    );
  }
  return [
    { ...purchase, event: { ...purchase.event, funding: "IN_KIND" } },
    {
      kind: "domain",
      instrument: null,
      event: dividendEventSchema.parse({
        ...base(saveback),
        type: "DIVIDEND",
        instrumentId: purchase.event.instrumentId,
        grossAmount: abs(saveback.amount),
        taxWithheld: new Decimal(absOrZero(saveback.tax))
          .plus(absOrZero(buy.tax))
          .toFixed(),
        funding: "IN_KIND",
      }),
    },
  ];
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
