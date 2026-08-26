import type {
  InstrumentRepository,
  LedgerRepository,
  PriceRepository,
} from "~/core/ports";

import {
  BatchBuilder,
  persistBatch,
  type ImportSummary,
  type MappedBatch,
} from "../ingest";
import { groupByRefid, mapGroup, priceLookupFrom } from "./map";
import { parseKrakenCsv } from "./row";

export class KrakenCsvAdapter {
  constructor(
    private readonly instruments: InstrumentRepository,
    private readonly ledger: LedgerRepository,
    private readonly prices: PriceRepository | null = null,
  ) {}

  async plan(csv: string): Promise<MappedBatch> {
    const rows = parseKrakenCsv(csv);
    const groups = groupByRefid(rows);
    const priceAt = priceLookupFrom(
      this.prices ? await this.prices.historyFor("BTC") : [],
    );

    const builder = new BatchBuilder();
    for (const group of groups.values()) {
      try {
        for (const item of mapGroup(group, priceAt)) {
          builder.add(item);
        }
      } catch {
        builder.addError();
      }
    }
    return builder.build(groups.size);
  }

  async import(csv: string): Promise<ImportSummary> {
    return persistBatch(this.instruments, this.ledger, await this.plan(csv));
  }
}
