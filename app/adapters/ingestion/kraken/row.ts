import Papa from "papaparse";
import { z } from "zod";

export const krakenRowSchema = z.object({
  txid: z.string(),
  refid: z.string(),
  time: z.string(),
  type: z.string(),
  subtype: z.string().optional(),
  aclass: z.string(),
  subclass: z.string(),
  asset: z.string(),
  wallet: z.string(),
  amount: z.string(),
  fee: z.string(),
  balance: z.string(),
  amountusd: z.string().optional(),
  feeusd: z.string().optional(),
  balanceusd: z.string().optional(),
  feecurrency: z.string().optional(),
});

export type KrakenRow = z.infer<typeof krakenRowSchema>;

export class KrakenLegacyExportError extends Error {
  constructor() {
    super("A Kraken export without a wallet column is the old format");
    this.name = "KrakenLegacyExportError";
  }
}

export function parseTime(time: string): Date {
  return new Date(`${time.replace(" ", "T")}Z`);
}

export function parseKrakenCsv(csv: string): KrakenRow[] {
  const { data, errors, meta } = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
  });
  if (errors.length > 0) {
    throw new Error(`CSV parse error: ${errors[0]!.message}`);
  }
  if (!(meta.fields ?? []).includes("wallet")) {
    throw new KrakenLegacyExportError();
  }
  return data
    .filter((raw) => (raw.type ?? "").trim() !== "")
    .map((raw) => krakenRowSchema.parse(raw));
}
