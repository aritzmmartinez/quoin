import Papa from "papaparse";
import { z } from "zod";

export const tradeRepublicRowSchema = z.object({
  datetime: z.string(),
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
