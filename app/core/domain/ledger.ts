import Decimal from "decimal.js";
import { z } from "zod";

import { parseIsoDate } from "../calendar";

import { exposureKindSchema } from "./exposure";
import { BASE_CURRENCY } from "./money";

export const decimalString = z.string().refine((value) => {
  try {
    return new Decimal(value).isFinite();
  } catch {
    return false;
  }
}, "must be a finite decimal string");

export const thesisSchema = z.enum(["CORE", "CONVICTION", "TACTICAL"]);
export type Thesis = z.infer<typeof thesisSchema>;

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
  assetClass: z.string().nullish(),
  quoteSymbol: z.string().nullish(),
  exposureKind: exposureKindSchema.nullish(),
  exposureLeafId: z.string().nullish(),
  ter: decimalString.nullish(),
  hedgedToBase: z.boolean().optional(),
  thesis: thesisSchema.default("CORE"),
});
export type Instrument = z.infer<typeof instrumentSchema>;

export const fxSourceSchema = z.enum([
  "IDENTITY",
  "BROKER",
  "ECB",
  "MARKET",
  "MANUAL",
]);
export type FxSource = z.infer<typeof fxSourceSchema>;

export const fxDirectionSchema = z.enum(["QUOTE_PER_BASE", "BASE_PER_QUOTE"]);
export type FxDirection = z.infer<typeof fxDirectionSchema>;

export const valuationSourceSchema = z.enum(["kraken-amountusd", "yahoo"]);
export type ValuationSource = z.infer<typeof valuationSourceSchema>;

export const linkKindSchema = z.enum(["swap"]);
export type LinkKind = z.infer<typeof linkKindSchema>;

const baseEventSchema = z.object({
  id: z.string(),
  ts: z.date(),
  currency: z.string(),
  fxSource: fxSourceSchema.optional(),
  fxDate: z.string().nullish(),
  fxRate: decimalString.nullish(),
  fxDirection: fxDirectionSchema.nullish(),
  originalAmount: decimalString.nullish(),
  originalCurrency: z.string().nullish(),
  valuationSource: z.string().nullish(),
  linkId: z.string().nullish(),
  linkKind: z.string().nullish(),
  account: z.string(),
  source: z.string(),
  externalId: z.string().nullish(),
  note: z.string().nullish(),
});

export const fundingSchema = z.enum(["CASH", "IN_KIND"]);
export type Funding = z.infer<typeof fundingSchema>;

export const tradeEventSchema = baseEventSchema.extend({
  type: z.enum(["BUY", "SELL"]),
  instrumentId: z.string(),
  quantity: decimalString,
  price: decimalString,
  grossAmount: decimalString,
  fees: decimalString,
  funding: fundingSchema.optional(),
});
export type TradeEvent = z.infer<typeof tradeEventSchema>;

export const dividendEventSchema = baseEventSchema.extend({
  type: z.literal("DIVIDEND"),
  instrumentId: z.string(),
  grossAmount: decimalString,
  taxWithheld: decimalString,
  funding: fundingSchema.optional(),
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

function isCalendarDay(value: string): boolean {
  try {
    parseIsoDate(value);
    return true;
  } catch {
    return false;
  }
}

export function isUnconvertedForeign(event: LedgerEvent): boolean {
  return (
    (event.fxSource ?? "IDENTITY") === "IDENTITY" &&
    event.currency !== BASE_CURRENCY &&
    event.fxRate == null &&
    event.fxDirection == null &&
    event.fxDate == null
  );
}

export const ledgerEventWriteSchema = ledgerEventSchema.superRefine(
  (event, ctx) => {
    const source = event.fxSource ?? "IDENTITY";
    const conversion = [event.fxRate, event.fxDirection, event.fxDate];
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });

    if (
      event.valuationSource != null &&
      !valuationSourceSchema.safeParse(event.valuationSource).success
    ) {
      issue(`Unknown valuation source "${event.valuationSource}"`);
    }

    if (
      event.linkKind != null &&
      !linkKindSchema.safeParse(event.linkKind).success
    ) {
      issue(`Unknown link kind "${event.linkKind}"`);
    }
    if ((event.linkId == null) !== (event.linkKind == null)) {
      issue("A link needs both its id and its kind, or neither");
    }
    if (
      event.linkKind === "swap" &&
      event.type !== "BUY" &&
      event.type !== "SELL"
    ) {
      issue("A swap leg is a purchase or a sale");
    }

    if (source === "IDENTITY") {
      if (event.currency !== BASE_CURRENCY) {
        issue(
          `An amount in ${event.currency} needs a conversion to ${BASE_CURRENCY}`,
        );
      }
      if (conversion.some((value) => value != null)) {
        issue(
          "An amount booked as it stands carries no rate, direction or day",
        );
      }
      return;
    }

    if (event.currency === BASE_CURRENCY) {
      issue(`An amount in ${BASE_CURRENCY} is not converted (${source})`);
    }
    if (conversion.some((value) => value == null)) {
      issue(`A ${source} conversion needs its rate, direction and day`);
    }
    if (event.fxRate != null && !new Decimal(event.fxRate).gt(0)) {
      issue(`A rate must be positive, got ${event.fxRate}`);
    }
    if (event.fxDate != null && !isCalendarDay(event.fxDate)) {
      issue(`A rate's day must be a YYYY-MM-DD date, got ${event.fxDate}`);
    }
  },
);

export function isInKind(event: LedgerEvent): boolean {
  return "funding" in event && event.funding === "IN_KIND";
}

export function isSwapLeg(event: LedgerEvent): boolean {
  return event.linkKind === "swap";
}

export const MAX_TER_PERCENT = 5;

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
