import { z } from "zod";

export const PRICE_TAIL_DAYS = 7;
const MAX_TAIL_ROWS = (PRICE_TAIL_DAYS + 1) * 2;
const DAY_MS = 86_400_000;

const instant = z.iso.datetime({ offset: true });

export const priceHoldingSchema = z.object({
  instrumentId: z.string().min(1),
  quoteSymbol: z.string().nullable(),
  first: instant.nullable(),
  last: instant.nullable(),
  count: z.number().int().nonnegative(),
});
export type PriceHolding = z.infer<typeof priceHoldingSchema>;

export const pricesRequestSchema = z.object({
  instruments: z.array(priceHoldingSchema),
});

export interface PriceRow {
  asOf: string;
  price: string;
  currency: string;
  source: string;
}

export interface StoredPrices {
  quoteSymbol: string | null;
  rows: readonly PriceRow[];
}

export type PriceAnswer =
  | { instrumentId: string; kind: "pending" }
  | { instrumentId: string; kind: "full"; rows: readonly PriceRow[] }
  | {
      instrumentId: string;
      kind: "tail";
      from: string;
      rows: readonly PriceRow[];
    };

export function answerPrices(
  stored: StoredPrices,
  holding: PriceHolding,
  pending: boolean,
): PriceAnswer {
  const { instrumentId } = holding;
  if (pending) return { instrumentId, kind: "pending" };

  const full: PriceAnswer = { instrumentId, kind: "full", rows: stored.rows };
  const first = stored.rows[0];
  if (
    !first ||
    holding.quoteSymbol !== stored.quoteSymbol ||
    holding.first === null ||
    holding.last === null ||
    Date.parse(holding.first) !== Date.parse(first.asOf)
  ) {
    return full;
  }

  const fromMs = Date.parse(holding.last) - PRICE_TAIL_DAYS * DAY_MS;
  const tail = stored.rows.filter((row) => Date.parse(row.asOf) >= fromMs);
  const older = stored.rows.length - tail.length;
  if (holding.count < older || holding.count > older + MAX_TAIL_ROWS) {
    return full;
  }

  return {
    instrumentId,
    kind: "tail",
    from: new Date(fromMs).toISOString(),
    rows: tail,
  };
}
