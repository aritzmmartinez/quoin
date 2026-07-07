import Decimal from "decimal.js";
import { z } from "zod";

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
