import type { InstrumentRepository, LedgerRepository } from "~/core/ports";

import {
  BatchBuilder,
  persistBatch,
  type ImportSummary,
  type MappedBatch,
} from "../ingest";
import { mapRow } from "./map";
import { parseTradeRepublicCsv } from "./row";

export class TradeRepublicCsvAdapter {
  constructor(
    private readonly instruments: InstrumentRepository,
    private readonly ledger: LedgerRepository,
  ) {}

  plan(csv: string): MappedBatch {
    const rows = parseTradeRepublicCsv(csv);
    const builder = new BatchBuilder();
    for (const row of rows) {
      try {
        builder.add(mapRow(row));
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
