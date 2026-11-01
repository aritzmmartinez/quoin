import type { InstrumentRepository, LedgerRepository } from "~/core/ports";

import { rowRef } from "../csv";
import {
  BatchBuilder,
  persistBatch,
  rowErrorReason,
  type ImportSummary,
  type MappedBatch,
} from "../ingest";
import { rateLookupFor, type RateBookLoader } from "../fx";
import { mapRow, mapSavebackPurchase } from "./map";
import { parseTradeRepublicCsv, type TradeRepublicParsedRow } from "./row";
import { pairSavebacks } from "./saveback";

export class TradeRepublicCsvAdapter {
  constructor(
    private readonly instruments: InstrumentRepository,
    private readonly ledger: LedgerRepository,
    private readonly zone: string,
    private readonly rates: RateBookLoader | null = null,
  ) {}

  async plan(csv: string): Promise<MappedBatch> {
    const { rows, errors } = parseTradeRepublicCsv(csv);
    const pairs = pairSavebacks(rows);
    const savebackOf = new Map<string, TradeRepublicParsedRow>();
    for (const row of rows) {
      const buy = pairs.get(row.transaction_id);
      if (buy !== undefined && !savebackOf.has(buy)) savebackOf.set(buy, row);
    }

    const builder = new BatchBuilder(
      this.zone,
      await rateLookupFor(
        this.rates,
        rows.map((row) => row.currency),
        this.zone,
      ),
    );
    for (const error of errors) builder.addError(error);
    for (const row of rows) {
      if (pairs.has(row.transaction_id)) continue;
      const saveback = savebackOf.get(row.transaction_id);
      try {
        if (saveback) builder.addOperation(mapSavebackPurchase(row, saveback));
        else builder.add(mapRow(row));
      } catch (error) {
        const reason = rowErrorReason(error);
        for (const failed of saveback ? [saveback, row] : [row]) {
          builder.addError({
            ...rowRef(
              failed.transaction_id,
              failed.position,
              failed.datetime,
              failed.type,
            ),
            reason,
          });
        }
      }
    }
    return builder.build(rows.length + errors.length);
  }

  async import(csv: string): Promise<ImportSummary> {
    return persistBatch(this.instruments, this.ledger, await this.plan(csv));
  }
}
