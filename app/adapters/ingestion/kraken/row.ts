import Papa from "papaparse";
import { z } from "zod";

export const krakenRowSchema = z.object({
  refid: z.string(),
  time: z.string(),
  type: z.string(),
  subclass: z.string(),
  asset: z.string(),
  amount: z.string(),
  fee: z.string(),
});

export type KrakenRow = z.infer<typeof krakenRowSchema>;

export function parseKrakenCsv(csv: string): KrakenRow[] {
  const { data, errors } = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });
  if (errors.length > 0) {
    throw new Error(`CSV parse error: ${errors[0]!.message}`);
  }
  return data.map((raw) => krakenRowSchema.parse(raw));
}
