import {
  instrumentSchema,
  ledgerEventSchema,
  type Instrument,
  type LedgerEvent,
} from "~/core/domain";

/* ----------------------------- Ledger entries ----------------------------- */

/**
 * Shape of a `LedgerEntry` row as stored (mirrors the Prisma model). Typed locally
 * so the mapper stays pure and testable without importing the generated client.
 */
export interface LedgerEntryRow {
  id: string;
  ts: Date;
  type: string;
  sleeve: string | null;
  instrumentId: string | null;
  quantity: string | null;
  price: string | null;
  grossAmount: string;
  fees: string;
  taxWithheld: string;
  currency: string;
  fxToBase: string;
  account: string;
  source: string;
  externalId: string | null;
  note: string | null;
}

export type LedgerEntryCreateData = Omit<LedgerEntryRow, never>;

/**
 * Map a stored row into a validated domain event. The row's free-form `type`/`sleeve`
 * strings are validated against the domain schema here — the single point where "a DB
 * row is a valid event" is enforced. Throws on corrupt data instead of casting blindly.
 */
export function rowToEvent(row: LedgerEntryRow): LedgerEvent {
  const base = {
    id: row.id,
    ts: row.ts,
    currency: row.currency,
    fxToBase: row.fxToBase,
    account: row.account,
    source: row.source,
    externalId: row.externalId,
    note: row.note,
  };

  switch (row.type) {
    case "BUY":
    case "SELL":
      return ledgerEventSchema.parse({
        ...base,
        type: row.type,
        instrumentId: row.instrumentId,
        sleeve: row.sleeve,
        quantity: row.quantity,
        price: row.price,
        grossAmount: row.grossAmount,
        fees: row.fees,
      });
    case "DIVIDEND":
      return ledgerEventSchema.parse({
        ...base,
        type: "DIVIDEND",
        instrumentId: row.instrumentId,
        sleeve: row.sleeve,
        grossAmount: row.grossAmount,
        taxWithheld: row.taxWithheld,
      });
    case "DEPOSIT":
    case "WITHDRAWAL":
    case "INTEREST":
      return ledgerEventSchema.parse({
        ...base,
        type: row.type,
        grossAmount: row.grossAmount,
      });
    default:
      throw new Error(`Unknown ledger entry type: "${row.type}"`);
  }
}

/** Map a domain event into row data for insertion. Exhaustive over the union. */
export function eventToCreateData(event: LedgerEvent): LedgerEntryCreateData {
  const base = {
    id: event.id,
    ts: event.ts,
    currency: event.currency,
    fxToBase: event.fxToBase,
    account: event.account,
    source: event.source,
    externalId: event.externalId ?? null,
    note: event.note ?? null,
  };

  switch (event.type) {
    case "BUY":
    case "SELL":
      return {
        ...base,
        type: event.type,
        sleeve: event.sleeve,
        instrumentId: event.instrumentId,
        quantity: event.quantity,
        price: event.price,
        grossAmount: event.grossAmount,
        fees: event.fees,
        taxWithheld: "0",
      };
    case "DIVIDEND":
      return {
        ...base,
        type: "DIVIDEND",
        sleeve: event.sleeve,
        instrumentId: event.instrumentId,
        quantity: null,
        price: null,
        grossAmount: event.grossAmount,
        fees: "0",
        taxWithheld: event.taxWithheld,
      };
    case "DEPOSIT":
    case "WITHDRAWAL":
    case "INTEREST":
      return {
        ...base,
        type: event.type,
        sleeve: null,
        instrumentId: null,
        quantity: null,
        price: null,
        grossAmount: event.grossAmount,
        fees: "0",
        taxWithheld: "0",
      };
  }
}

/* ------------------------------- Instruments ------------------------------ */

/** Shape of an `Instrument` row as stored (mirrors the Prisma model). */
export interface InstrumentRow {
  id: string;
  name: string;
  type: string;
  currency: string;
  assetClass: string | null;
}

export type InstrumentWriteData = InstrumentRow;

/** Map a stored row into a validated domain instrument (validates the `type` enum). */
export function rowToInstrument(row: InstrumentRow): Instrument {
  return instrumentSchema.parse({
    id: row.id,
    name: row.name,
    type: row.type,
    currency: row.currency,
    assetClass: row.assetClass,
  });
}

/** Map a domain instrument into row data for create/update. */
export function instrumentToWriteData(instrument: Instrument): InstrumentWriteData {
  return {
    id: instrument.id,
    name: instrument.name,
    type: instrument.type,
    currency: instrument.currency,
    assetClass: instrument.assetClass ?? null,
  };
}
