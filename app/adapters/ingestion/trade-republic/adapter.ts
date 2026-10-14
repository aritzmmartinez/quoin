import type { InstrumentRepository, LedgerRepository } from "~/core/ports";

import {
  BatchBuilder,
  persistBatch,
  type ImportSummary,
  type MappedBatch,
} from "../ingest";
import { mapRow, mapSavebackPurchase } from "./map";
import { parseTradeRepublicCsv, type TradeRepublicRow } from "./row";
import { pairSavebacks } from "./saveback";

export class TradeRepublicCsvAdapter {
  constructor(
    private readonly instruments: InstrumentRepository,
    private readonly ledger: LedgerRepository,
  ) {}

  plan(csv: string): MappedBatch {
    const rows = parseTradeRepublicCsv(csv);
    const pairs = pairSavebacks(rows);
    const savebackOf = new Map<string, TradeRepublicRow>();
    for (const row of rows) {
      const buy = pairs.get(row.transaction_id);
      if (buy !== undefined && !savebackOf.has(buy)) savebackOf.set(buy, row);
    }

    const builder = new BatchBuilder();
    for (const row of rows) {
      try {
        if (pairs.has(row.transaction_id)) continue;
        const saveback = savebackOf.get(row.transaction_id);
        if (saveback) builder.addOperation(mapSavebackPurchase(row, saveback));
        else builder.add(mapRow(row));
      } catch {
        builder.addError();
      }
    }
    return builder.build(rows.length);
  }

  async import(csv: string): Promise<ImportSummary> {
    return persistBatch(this.instruments, this.ledger, this.plan(csv));
  }
}
