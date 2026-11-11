import type { Instrument } from "~/core/domain";
import type {
  InstrumentRepository,
  LedgerRepository,
  PriceRepository,
  PriceSnapshot,
} from "~/core/ports";

import {
  BatchBuilder,
  persistBatch,
  rowErrorReason,
  type ImportSummary,
  type MappedBatch,
} from "../ingest";
import { rateLookupFor, type RateBookLoader } from "../fx";
import { KrakenBalanceMismatchError, findBalanceMismatch } from "./balance";
import {
  REWARD_NOTE,
  groupByRefid,
  isInternalMove,
  krakenCryptoIds,
  mapGroup,
  priceLookupFrom,
} from "./map";
import { krakenRowRef, parseKrakenCsv, parseTime, type KrakenRow } from "./row";

export class KrakenCsvAdapter {
  constructor(
    private readonly instruments: InstrumentRepository,
    private readonly ledger: LedgerRepository,
    private readonly zone: string,
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
    const histories = await this.histories(krakenCryptoIds(rows));
    const priceAt = priceLookupFrom(histories);

    const builder = new BatchBuilder(
      this.zone,
      await rateLookupFor(
        this.rates,
        [
          ...rows.filter((row) => row.subclass === "fiat").map((r) => r.asset),
          ...histories.map((snapshot) => snapshot.currency),
          ...(rows.some((row) => row.amountusd) ? ["USD"] : []),
        ],
        this.zone,
      ),
    );
    const internal: KrakenRow[] = [];
    for (const group of groups.values()) {
      const first = group[0]!;
      if (group.some((row) => Number.isNaN(parseTime(row.time).getTime()))) {
        builder.addError({ ...krakenRowRef(first), reason: "invalid-date" });
        continue;
      }
      if (group.every(isInternalMove)) internal.push(first);
      try {
        builder.addOperation(mapGroup(group, priceAt));
      } catch (error) {
        builder.addError({
          ...krakenRowRef(first),
          reason: rowErrorReason(error),
        });
      }
    }
    for (const row of await this.bookedAsRewards(internal)) {
      builder.addNotice("internal-booked-as-reward", {
        date: parseTime(row.time).toISOString(),
        type: row.type,
        subtype: row.subtype || null,
        instrument: row.asset || null,
      });
    }
    const batch = builder.build();
    return { ...batch, instruments: await this.keepNames(batch.instruments) };
  }

  async import(csv: string): Promise<ImportSummary> {
    return persistBatch(this.instruments, this.ledger, await this.plan(csv));
  }

  private async histories(ids: readonly string[]): Promise<PriceSnapshot[]> {
    if (!this.prices) return [];
    const prices = this.prices;
    return (await Promise.all(ids.map((id) => prices.historyFor(id)))).flat();
  }

  private async keepNames(
    instruments: readonly Instrument[],
  ): Promise<Instrument[]> {
    if (instruments.length === 0) return [];
    const named = new Map(
      (await this.instruments.list()).map((i) => [i.id, i.name]),
    );
    return instruments.map((instrument) => {
      const name = named.get(instrument.id);
      return name ? { ...instrument, name } : instrument;
    });
  }

  private async bookedAsRewards(
    internal: readonly KrakenRow[],
  ): Promise<KrakenRow[]> {
    if (internal.length === 0) return [];
    const rewards = new Set(
      (await this.ledger.list())
        .filter(
          (event) =>
            event.source === "KRAKEN_CSV" &&
            event.type === "BUY" &&
            event.note === REWARD_NOTE,
        )
        .map((event) => event.externalId),
    );
    return internal.filter((row) => rewards.has(row.refid));
  }
}
