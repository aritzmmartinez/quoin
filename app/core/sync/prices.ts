import { z } from "zod";

export const PRICE_TAIL_DAYS = 7;
const TAIL_MS = PRICE_TAIL_DAYS * 86_400_000;

const instant = z.iso.datetime({ offset: true });

export const priceHoldingSchema = z.object({
  instrumentId: z.string().min(1),
  seriesVersion: z.string().nullable(),
  last: instant.nullable(),
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
  seriesVersion: string;
  rows: readonly PriceRow[];
}

export type PriceAnswer =
  | { instrumentId: string; kind: "pending" }
  | {
      instrumentId: string;
      kind: "full";
      seriesVersion: string;
      rows: readonly PriceRow[];
    }
  | {
      instrumentId: string;
      kind: "tail";
      seriesVersion: string;
      from: string;
      rows: readonly PriceRow[];
    };

export function answerPrices(
  stored: StoredPrices,
  holding: PriceHolding,
  pending: boolean,
): PriceAnswer {
  const { instrumentId, last } = holding;
  if (pending) return { instrumentId, kind: "pending" };

  const { seriesVersion, rows } = stored;
  if (
    rows.length === 0 ||
    last === null ||
    holding.seriesVersion !== seriesVersion
  ) {
    return { instrumentId, kind: "full", seriesVersion, rows };
  }

  const fromMs = Date.parse(last) - TAIL_MS;
  return {
    instrumentId,
    kind: "tail",
    seriesVersion,
    from: new Date(fromMs).toISOString(),
    rows: rows.filter((row) => Date.parse(row.asOf) >= fromMs),
  };
}

export function reachesBehindTail(
  newestStoredMs: number | null,
  touchedMs: readonly number[],
): boolean {
  return (
    newestStoredMs !== null &&
    touchedMs.some((ms) => ms < newestStoredMs - TAIL_MS)
  );
}
