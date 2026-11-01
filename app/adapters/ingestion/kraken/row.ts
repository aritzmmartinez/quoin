import { z } from "zod";

import { CsvFileError, readCsv, requireColumns, rowRef } from "../csv";
import type { RowRef } from "../discard";

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

const COLUMNS = Object.entries(krakenRowSchema.shape)
  .filter(([, schema]) => !schema.safeParse(undefined).success)
  .map(([column]) => column);

export type KrakenParsedRow = KrakenRow & { position: number };

export function krakenRowRef(row: KrakenParsedRow): RowRef {
  return rowRef(row.refid, row.position, row.time, row.type);
}

export function parseKrakenCsv(csv: string): KrakenParsedRow[] {
  const read = readCsv(csv, COLUMNS);
  if (read.missing.includes("wallet")) throw new KrakenLegacyExportError();
  requireColumns(read);
  return read.records.map(({ raw, position, malformed }) => {
    if (malformed) {
      throw new CsvFileError(
        "wrong-field-count",
        null,
        rowRef(raw.refid, position, raw.time, raw.type),
      );
    }
    return { ...krakenRowSchema.parse(raw), position };
  });
}
