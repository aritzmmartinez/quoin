import Papa from "papaparse";
import { z } from "zod";

export const tradeRepublicRowSchema = z.object({
  // An offset or Z is required: without one, `new Date` reads the process's zone,
  // and the same row would be two instants in Docker (UTC) and in Madrid.
  datetime: z.iso.datetime({ offset: true }),
  category: z.string(),
  type: z.string(),
  asset_class: z.string(),
  name: z.string(),
  symbol: z.string(),
  shares: z.string(),
  price: z.string(),
  amount: z.string(),
  fee: z.string(),
  tax: z.string(),
  currency: z.string(),
  transaction_id: z.string(),
  original_amount: z.string().optional(),
  original_currency: z.string().optional(),
  fx_rate: z.string().optional(),
});

export type TradeRepublicRow = z.infer<typeof tradeRepublicRowSchema>;

export function parseTradeRepublicCsv(csv: string): TradeRepublicRow[] {
  const { data, errors } = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
  });
  if (errors.length > 0) {
    throw new Error(`CSV parse error: ${errors[0]!.message}`);
  }
  return data
    .filter((raw) => (raw.type ?? "").trim() !== "")
    .map((raw) => tradeRepublicRowSchema.parse(raw));
}
