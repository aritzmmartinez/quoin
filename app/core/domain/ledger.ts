import Decimal from "decimal.js";
import { z } from "zod";

/**
 * Ledger domain, defined with Zod as the single source of truth.
 *
 * The runtime schemas and the TypeScript types are one and the same: types are
 * inferred from the schemas (`z.infer`), so they can never drift. These schemas are
 * reused by the persistence mapper (to validate rows read from the DB) and will back
 * the transaction form (the same discriminated union).
 *
 * Money and quantities are decimal strings here and are only turned into `Money` /
 * Decimal inside projections.
 */

/** A string that parses as a finite decimal. Reused for every money/quantity field. */
export const decimalString = z
  .string()
  .refine((value) => {
    try {
      return new Decimal(value).isFinite();
    } catch {
      return false;
    }
  }, "must be a finite decimal string");

export const sleeveSchema = z.enum(["CORE", "TRADING"]);
export type Sleeve = z.infer<typeof sleeveSchema>;

export const instrumentTypeSchema = z.enum([
  "ETF",
  "STOCK",
  "CRYPTO",
  "BOND",
  "COMMODITY",
  "CASH",
]);
export type InstrumentType = z.infer<typeof instrumentTypeSchema>;

export const instrumentSchema = z.object({
  /** ISIN, or a ticker/symbol for assets without an ISIN (e.g. crypto). */
  id: z.string().min(1),
  name: z.string(),
  type: instrumentTypeSchema,
  currency: z.string(),
  assetClass: z.string().nullish(),
});
export type Instrument = z.infer<typeof instrumentSchema>;

/** Fields shared by every ledger event. */
const baseEventSchema = z.object({
  id: z.string(),
  ts: z.date(),
  currency: z.string(),
  /** Rate to the base currency (EUR) at operation time; "1" if already in base. */
  fxToBase: decimalString,
  account: z.string(),
  source: z.string(),
  externalId: z.string().nullish(),
  note: z.string().nullish(),
});

/** A buy or sell of an instrument. */
export const tradeEventSchema = baseEventSchema.extend({
  type: z.enum(["BUY", "SELL"]),
  instrumentId: z.string(),
  sleeve: sleeveSchema,
  quantity: decimalString,
  price: decimalString,
  grossAmount: decimalString,
  fees: decimalString,
});
export type TradeEvent = z.infer<typeof tradeEventSchema>;

/** A dividend paid by an instrument. Does not change the held quantity. */
export const dividendEventSchema = baseEventSchema.extend({
  type: z.literal("DIVIDEND"),
  instrumentId: z.string(),
  sleeve: sleeveSchema.nullable(),
  grossAmount: decimalString,
  taxWithheld: decimalString,
});
export type DividendEvent = z.infer<typeof dividendEventSchema>;

/** A portfolio-level cash movement not tied to an instrument. */
export const cashEventSchema = baseEventSchema.extend({
  type: z.enum(["DEPOSIT", "WITHDRAWAL", "INTEREST"]),
  grossAmount: decimalString,
});
export type CashEvent = z.infer<typeof cashEventSchema>;

/** Discriminated union on `type`. Extend with new variants as features land (e.g. SPLIT). */
export const ledgerEventSchema = z.discriminatedUnion("type", [
  tradeEventSchema,
  dividendEventSchema,
  cashEventSchema,
]);
export type LedgerEvent = z.infer<typeof ledgerEventSchema>;

export type LedgerEventType = LedgerEvent["type"];
