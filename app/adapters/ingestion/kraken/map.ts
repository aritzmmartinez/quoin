import Decimal from "decimal.js";

import {
  cashEventSchema,
  tradeEventSchema,
  type Instrument,
} from "~/core/domain";

import type { MappedItem } from "../ingest";
import type { KrakenRow } from "./row";

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

/**
 * Map a refid group to a domain contribution, or flag it for discard.
 *
 * Scope (per configuration): BTC only, plus EUR cash movements. Non-BTC crypto
 * (rewards, earns, crypto-to-crypto swaps) is discarded as "non-btc"; anything
 * unrecognized as "unsupported". Everything enters the CORE sleeve.
 *
 */
export function mapGroup(rows: KrakenRow[]): MappedItem {
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
          ? reward(refid, row)
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

function reward(refid: string, row: KrakenRow): MappedItem {
  return {
    kind: "domain",
    instrument: BTC,
    event: tradeEventSchema.parse({
      id: crypto.randomUUID(),
      ts: parseTime(row.time),
      type: "BUY",
      instrumentId: "BTC",
      sleeve: "CORE",
      quantity: abs(row.amount),
      price: "0",
      grossAmount: "0",
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
