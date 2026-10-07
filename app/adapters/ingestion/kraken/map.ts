import Decimal from "decimal.js";

import {
  Money,
  cashEventSchema,
  dividendEventSchema,
  instrumentSchema,
  tradeEventSchema,
  type Instrument,
} from "~/core/domain";
import type { PriceSnapshot } from "~/core/ports";

import type { DiscardReason, MappedItem } from "../ingest";
import type { KrakenRow } from "./row";

function discard(
  reason: DiscardReason,
  row: KrakenRow,
  instrument: string | null = row.asset || null,
): MappedItem {
  return {
    kind: "discard",
    reason,
    detail: {
      date: parseTime(row.time).toISOString(),
      type: row.type,
      subtype: row.subtype || null,
      instrument,
    },
  };
}

function unsupported(row: KrakenRow): MappedItem {
  return discard("unsupported", row);
}

export type PriceAt = (instrumentId: string, ts: Date) => string | null;

const MAX_PRICE_AGE_DAYS = 7;

export function priceLookupFrom(snapshots: readonly PriceSnapshot[]): PriceAt {
  const byInstrument = new Map<string, PriceSnapshot[]>();
  for (const snapshot of snapshots) {
    const list = byInstrument.get(snapshot.instrumentId) ?? [];
    list.push(snapshot);
    byInstrument.set(snapshot.instrumentId, list);
  }
  for (const list of byInstrument.values()) {
    list.sort((a, b) => a.asOf.getTime() - b.asOf.getTime());
  }

  return (instrumentId, ts) => {
    const history = byInstrument.get(instrumentId);
    if (!history) return null;

    let candidate: PriceSnapshot | null = null;
    for (const snapshot of history) {
      if (snapshot.asOf.getTime() > ts.getTime()) break;
      candidate = snapshot;
    }
    if (!candidate) return null;

    const ageDays =
      (ts.getTime() - candidate.asOf.getTime()) / (24 * 60 * 60 * 1000);
    return ageDays > MAX_PRICE_AGE_DAYS ? null : candidate.price;
  };
}

const BTC: Instrument = instrumentSchema.parse({
  id: "BTC",
  name: "Bitcoin",
  type: "CRYPTO",
  currency: "EUR",
  assetClass: "crypto",
});

function parseTime(time: string): Date {
  return new Date(`${time.replace(" ", "T")}Z`);
}

function isFiat(row: KrakenRow): boolean {
  return row.subclass === "fiat";
}

function isBtc(row: KrakenRow): boolean {
  return row.asset === "BTC";
}

function abs(value: string): string {
  return new Decimal(value || "0").abs().toFixed();
}

export function groupByRefid(rows: KrakenRow[]): Map<string, KrakenRow[]> {
  const groups = new Map<string, KrakenRow[]>();
  for (const row of rows) {
    const group = groups.get(row.refid) ?? [];
    group.push(row);
    groups.set(row.refid, group);
  }
  return groups;
}

export function mapGroup(
  rows: KrakenRow[],
  priceAt: PriceAt = () => null,
): MappedItem[] {
  const refid = rows[0]!.refid;
  const spend = rows.find((r) => r.type === "spend");
  const receive = rows.find((r) => r.type === "receive");

  if (spend && receive) {
    if (isBtc(receive) && isFiat(spend))
      return [trade(refid, "BUY", spend, receive)];
    if (isBtc(spend) && isFiat(receive))
      return [trade(refid, "SELL", receive, spend)];
    const pair = `${spend.asset} → ${receive.asset}`;
    return [
      discard(
        isBtc(spend) || isBtc(receive) ? "crypto-swap" : "unmodelled-asset",
        receive,
        pair,
      ),
    ];
  }

  if (rows.length === 1) {
    const row = rows[0]!;
    switch (row.type) {
      case "deposit":
      case "withdrawal":
        if (isFiat(row))
          return [
            cash(refid, row, row.type === "deposit" ? "DEPOSIT" : "WITHDRAWAL"),
          ];
        return [
          discard(isBtc(row) ? "crypto-transfer" : "unmodelled-asset", row),
        ];
      case "reward":
      case "earn":
        return isBtc(row)
          ? reward(refid, row, priceAt)
          : [discard("unmodelled-asset", row)];
      default:
        return [unsupported(row)];
    }
  }

  return [unsupported(rows[0]!)];
}

function trade(
  refid: string,
  type: "BUY" | "SELL",
  fiat: KrakenRow,
  cryptoLeg: KrakenRow,
): MappedItem {
  const eur = new Decimal(abs(fiat.amount));
  const btc = new Decimal(abs(cryptoLeg.amount));
  return {
    kind: "domain",
    instrument: BTC,
    event: tradeEventSchema.parse({
      id: crypto.randomUUID(),
      ts: parseTime(fiat.time),
      type,
      instrumentId: "BTC",
      quantity: btc.toFixed(),
      price: btc.isZero() ? "0" : eur.dividedBy(btc).toFixed(),
      grossAmount: eur.toFixed(),
      fees: abs(fiat.fee),
      currency: "EUR",
      fxToBase: "1",
      account: "kraken",
      source: "KRAKEN_CSV",
      externalId: refid,
      note: null,
    }),
  };
}

/**
 * A reward is an acquisition with no counter-leg, so it needs two ledger
 * rows sharing one market value: a BUY that becomes the FIFO/AVCO lot's
 * acquisition cost, and a DIVIDEND recording the same value as income
 * ("rendimiento de capital mobiliario" on receipt, Bizkaia foral IRPF).
 * One event doing both jobs is what hid the income in the original bug —
 * see CLAUDE.md "Kraken rewards". The two rows share `refid` as a prefix
 * but need distinct `externalId`s to both survive the (source, externalId)
 * dedup key.
 */
function reward(refid: string, row: KrakenRow, priceAt: PriceAt): MappedItem[] {
  const ts = parseTime(row.time);
  const price = priceAt("BTC", ts);
  if (price === null) return [discard("reward-unpriced", row)];

  const quantity = abs(row.amount);
  const grossAmount = Money.fromString(price).scaleBy(quantity).toString();

  const acquisition: MappedItem = {
    kind: "domain",
    instrument: BTC,
    event: tradeEventSchema.parse({
      id: crypto.randomUUID(),
      ts,
      type: "BUY",
      instrumentId: "BTC",
      quantity,
      price,
      grossAmount,
      fees: "0",
      currency: "EUR",
      fxToBase: "1",
      account: "kraken",
      source: "KRAKEN_CSV",
      externalId: refid,
      note: "kraken-reward",
    }),
  };

  const income: MappedItem = {
    kind: "domain",
    instrument: null,
    event: dividendEventSchema.parse({
      id: crypto.randomUUID(),
      ts,
      type: "DIVIDEND",
      instrumentId: "BTC",
      grossAmount,
      taxWithheld: "0",
      currency: "EUR",
      fxToBase: "1",
      account: "kraken",
      source: "KRAKEN_CSV",
      externalId: `${refid}:income`,
      note: "kraken-reward-income",
    }),
  };

  return [acquisition, income];
}

function cash(
  refid: string,
  row: KrakenRow,
  type: "DEPOSIT" | "WITHDRAWAL",
): MappedItem {
  return {
    kind: "domain",
    instrument: null,
    event: cashEventSchema.parse({
      id: crypto.randomUUID(),
      ts: parseTime(row.time),
      type,
      grossAmount: abs(row.amount),
      currency: row.asset,
      fxToBase: "1",
      account: "kraken",
      source: "KRAKEN_CSV",
      externalId: refid,
      note: null,
    }),
  };
}
