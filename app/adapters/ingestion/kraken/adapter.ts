import type { InstrumentRepository, LedgerRepository } from "~/core/ports";

import {
  BatchBuilder,
  persistBatch,
  type ImportSummary,
  type MappedBatch,
} from "../ingest";
import { groupByRefid, mapGroup } from "./map";
import { parseKrakenCsv } from "./row";

export class KrakenCsvAdapter {
  constructor(
    private readonly instruments: InstrumentRepository,
    private readonly ledger: LedgerRepository,
  ) {}

  plan(csv: string): MappedBatch {
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
    return builder.build(groups.size);
  }

  async import(csv: string): Promise<ImportSummary> {
    return persistBatch(this.instruments, this.ledger, this.plan(csv));
  }
}
