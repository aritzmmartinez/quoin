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
import { rateLookupFor, type RateBookLoader } from "../fx";
import { KrakenBalanceMismatchError, findBalanceMismatch } from "./balance";
import { groupByRefid, mapGroup, priceLookupFrom } from "./map";
import { parseKrakenCsv } from "./row";

export class KrakenCsvAdapter {
  constructor(
    private readonly instruments: InstrumentRepository,
    private readonly ledger: LedgerRepository,
    private readonly prices: PriceRepository | null = null,
    private readonly rates: RateBookLoader | null = null,
  ) {}

  async plan(csv: string): Promise<MappedBatch> {
    const rows = parseKrakenCsv(csv);
    const mismatch = findBalanceMismatch(rows);
    if (mismatch) {
      throw new KrakenBalanceMismatchError(
        mismatch.asset,
        mismatch.wallet,
        mismatch.date,
      );
    }
    const groups = groupByRefid(rows);
    const btcHistory = this.prices ? await this.prices.historyFor("BTC") : [];
    const priceAt = priceLookupFrom(btcHistory);

    const builder = new BatchBuilder(
      await rateLookupFor(this.rates, [
        ...rows.filter((row) => row.subclass === "fiat").map((r) => r.asset),
        ...btcHistory.map((snapshot) => snapshot.currency),
      ]),
    );
    for (const group of groups.values()) {
      try {
        builder.addOperation(mapGroup(group, priceAt));
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
