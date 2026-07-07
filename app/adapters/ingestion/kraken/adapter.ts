import type { InstrumentRepository, LedgerRepository } from "~/core/ports";

import { BatchBuilder, persistBatch, type ImportSummary } from "../ingest";
import { groupByRefid, mapGroup } from "./map";
import { parseKrakenCsv } from "./row";

/**
 * Imports a Kraken ledger CSV into the ledger. Groups rows by refid (a trade is a
 * spend + receive pair), maps each group to a domain contribution (BTC and EUR cash
 * only; other crypto discarded), then persists via the injected repositories.
 */
export class KrakenCsvAdapter {
  constructor(
    private readonly instruments: InstrumentRepository,
    private readonly ledger: LedgerRepository,
  ) {}

  async import(csv: string): Promise<ImportSummary> {
    const rows = parseKrakenCsv(csv);
    const groups = groupByRefid(rows);
    const builder = new BatchBuilder();

    for (const group of groups.values()) {
      try {
        builder.add(mapGroup(group));
      } catch {
        builder.addError();
      }
    }

    return persistBatch(this.instruments, this.ledger, builder.build(groups.size));
  }
}
