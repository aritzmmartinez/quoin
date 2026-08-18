import Decimal from "decimal.js";

import {
  Money,
  cashEventSchema,
  tradeEventSchema,
  type Instrument,
} from "~/core/domain";
import type { PriceSnapshot } from "~/core/ports";

import type { MappedItem } from "../ingest";
import type { KrakenRow } from "./row";

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

const BTC: Instrument = {
  id: "BTC",
  name: "Bitcoin",
  type: "CRYPTO",
  currency: "EUR",
  assetClass: "crypto",
};

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
): MappedItem {
  const refid = rows[0]!.refid;
  const spend = rows.find((r) => r.type === "spend");
  const receive = rows.find((r) => r.type === "receive");

  if (spend && receive) {
    if (isBtc(receive) && isFiat(spend))
      return trade(refid, "BUY", spend, receive);
    if (isBtc(spend) && isFiat(receive))
      return trade(refid, "SELL", receive, spend);
    return { kind: "discard", reason: "non-btc" };
  }

  if (rows.length === 1) {
    const row = rows[0]!;
    switch (row.type) {
      case "deposit":
        return isFiat(row)
          ? cash(refid, row, "DEPOSIT")
          : { kind: "discard", reason: "non-btc" };
      case "withdrawal":
        return isFiat(row)
          ? cash(refid, row, "WITHDRAWAL")
          : { kind: "discard", reason: "non-btc" };
      case "reward":
      case "earn":
        return isBtc(row)
          ? reward(refid, row, priceAt)
          : { kind: "discard", reason: "non-btc" };
      default:
        return { kind: "discard", reason: "unsupported" };
    }
  }

  return { kind: "discard", reason: "unsupported" };
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
      sleeve: "CORE",
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

function reward(refid: string, row: KrakenRow, priceAt: PriceAt): MappedItem {
  const ts = parseTime(row.time);
  const price = priceAt("BTC", ts);
  if (price === null) return { kind: "discard", reason: "reward-unpriced" };

  const quantity = abs(row.amount);
  const grossAmount = Money.fromString(price).scaleBy(quantity).toString();

  return {
    kind: "domain",
    instrument: BTC,
    event: tradeEventSchema.parse({
      id: crypto.randomUUID(),
      ts,
      type: "BUY",
      instrumentId: "BTC",
      sleeve: "CORE",
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
