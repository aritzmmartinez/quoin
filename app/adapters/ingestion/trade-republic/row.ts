import { z } from "zod";

import { readCsv, requireColumns, rowRef, type CsvRecord } from "../csv";
import type { RowError } from "../discard";

export const tradeRepublicRowSchema = z.object({
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

export type TradeRepublicParsedRow = TradeRepublicRow & { position: number };

const COLUMNS = Object.entries(tradeRepublicRowSchema.shape)
  .filter(([, schema]) => !schema.safeParse(undefined).success)
  .map(([column]) => column);

export function parseTradeRepublicCsv(csv: string): {
  rows: TradeRepublicParsedRow[];
  errors: RowError[];
} {
  const read = readCsv(csv, COLUMNS);
  requireColumns(read);
  const ref = ({ raw, position }: CsvRecord) =>
    rowRef(raw.transaction_id, position, raw.datetime, raw.type);

  const errors: RowError[] = [];
  const rows: TradeRepublicParsedRow[] = [];
  for (const record of read.records) {
    if (record.malformed) {
      errors.push({ ...ref(record), reason: "wrong-field-count" });
      continue;
    }
    const parsed = tradeRepublicRowSchema.safeParse(record.raw);
    if (parsed.success)
      rows.push({ ...parsed.data, position: record.position });
    else errors.push({ ...ref(record), reason: "invalid-date" });
  }
  return { rows, errors };
}
