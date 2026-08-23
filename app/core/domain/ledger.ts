import Decimal from "decimal.js";
import { z } from "zod";

import { exposureKindSchema } from "./exposure";

export const decimalString = z.string().refine((value) => {
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
  id: z.string().min(1),
  name: z.string(),
  type: instrumentTypeSchema,
  currency: z.string(),
  assetClass: z.string().nullish(),
  quoteSymbol: z.string().nullish(),
  exposureKind: exposureKindSchema.nullish(),
  exposureLeafId: z.string().nullish(),
  // Lenient on purpose: the range lives at the write boundary (`terPercentSchema`),
  // not here. A stored value the domain refused would throw on every read of the
  // instrument list — the `LedgerEntry.type` trap, one layer up.
  ter: decimalString.nullish(),
});
export type Instrument = z.infer<typeof instrumentSchema>;

const baseEventSchema = z.object({
  id: z.string(),
  ts: z.date(),
  currency: z.string(),
  fxToBase: decimalString,
  account: z.string(),
  source: z.string(),
  externalId: z.string().nullish(),
  note: z.string().nullish(),
});

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

export const dividendEventSchema = baseEventSchema.extend({
  type: z.literal("DIVIDEND"),
  instrumentId: z.string(),
  sleeve: sleeveSchema.nullable(),
  grossAmount: decimalString,
  taxWithheld: decimalString,
});
export type DividendEvent = z.infer<typeof dividendEventSchema>;

export const cashEventSchema = baseEventSchema.extend({
  type: z.enum(["DEPOSIT", "WITHDRAWAL", "INTEREST"]),
  grossAmount: decimalString,
});
export type CashEvent = z.infer<typeof cashEventSchema>;

export const ledgerEventSchema = z.discriminatedUnion("type", [
  tradeEventSchema,
  dividendEventSchema,
  cashEventSchema,
]);
export type LedgerEvent = z.infer<typeof ledgerEventSchema>;

export type LedgerEventType = LedgerEvent["type"];

export const MAX_TER_PERCENT = 5;

/**
 * A TER as a human types it on the instruments screen: percent, es-ES comma
 * allowed ("0,22" -> "0.002200").
 *
 * Bounded at the *write* boundary rather than in `instrumentSchema`. A fund
 * charging over 5% a year does not exist in this portfolio, while "0,22" typed
 * where a fraction was expected is 22% a year — a typo that would not look wrong
 * on screen and would quietly multiply the projected cost by a hundred. Refusing
 * is the correct failure; a flag next to a number already inside the arithmetic
 * is not.
 */
export const terPercentSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(",", "."))
  .refine((value) => {
    try {
      const percent = new Decimal(value);
      return (
        percent.isFinite() && percent.gte(0) && percent.lte(MAX_TER_PERCENT)
      );
    } catch {
      return false;
    }
  }, `A TER outside 0–${MAX_TER_PERCENT}% a year is a typo, not a fee.`)
  .transform((value) => new Decimal(value).div(100).toFixed(6));
