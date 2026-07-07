import type { InstrumentRepository, LedgerRepository } from "~/core/ports";

import { BatchBuilder, persistBatch, type ImportSummary } from "../ingest";
import { mapRow } from "./map";
import { parseTradeRepublicCsv } from "./row";

/**
 * Imports a Trade Republic CSV export into the ledger. Parses rows, maps each to a
 * domain contribution (card spending and unsupported types discarded), then persists
 * via the injected repositories. Repositories are injected, so the whole flow is
 * testable with fakes.
 */
export class TradeRepublicCsvAdapter {
  constructor(
    private readonly instruments: InstrumentRepository,
    private readonly ledger: LedgerRepository,
  ) {}

  async import(csv: string): Promise<ImportSummary> {
    const rows = parseTradeRepublicCsv(csv);
    const builder = new BatchBuilder();

    for (const row of rows) {
      try {
        builder.add(mapRow(row));
      } catch {
        builder.addError();
      }
    }

    return persistBatch(this.instruments, this.ledger, builder.build(rows.length));
  }
}
