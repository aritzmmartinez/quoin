import Decimal from "decimal.js";

import {
  Money,
  cashEventSchema,
  dividendEventSchema,
  instrumentSchema,
  tradeEventSchema,
  type Instrument,
  type ValuationSource,
} from "~/core/domain";
import type { PriceSnapshot } from "~/core/ports";
import { snapshotKnownAt } from "~/core/prices";
import { atOrBefore } from "~/core/series";

import { cryptoInstrumentId } from "../crypto-id";
import type { DiscardReason, MappedItem, NoticeReason } from "../ingest";
import { parseTime, type KrakenRow } from "./row";

export const REWARD_NOTE = "kraken-reward";
export const ACCOUNT_TRANSFER_NOTE = "kraken-account-transfer";

const INTERNAL_EARN = new Set([
  "allocation",
  "deallocation",
  "migration",
  "autoallocation",
]);

function detailOf(row: KrakenRow, instrument: string | null) {
  return {
    date: parseTime(row.time).toISOString(),
    type: row.type,
    subtype: row.subtype || null,
    instrument,
  };
}

function discard(
  reason: DiscardReason,
  row: KrakenRow,
  instrument: string | null = row.asset || null,
): Extract<MappedItem, { kind: "discard" }> {
  return { kind: "discard", reason, detail: detailOf(row, instrument) };
}

function notice(reason: NoticeReason, row: KrakenRow): MappedItem {
  return { kind: "notice", reason, detail: detailOf(row, row.asset || null) };
}

function unsupported(row: KrakenRow): MappedItem {
  return discard("unsupported", row);
}

export interface PricedAt {
  price: string;
  currency: string;
}

export type PriceAt = (instrumentId: string, ts: Date) => PricedAt | null;

const MAX_PRICE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function priceLookupFrom(snapshots: readonly PriceSnapshot[]): PriceAt {
  const byInstrument = new Map<string, PriceSnapshot[]>();
  for (const snapshot of snapshots) {
    const list = byInstrument.get(snapshot.instrumentId) ?? [];
    list.push(snapshot);
    byInstrument.set(snapshot.instrumentId, list);
  }
  for (const list of byInstrument.values()) {
    list.sort((a, b) => snapshotKnownAt(a) - snapshotKnownAt(b));
  }

  return (instrumentId, ts) => {
    const history = byInstrument.get(instrumentId);
    if (!history) return null;
    const close = atOrBefore(
      history,
      snapshotKnownAt,
      ts.getTime(),
      MAX_PRICE_AGE_MS,
    );
    return close ? { price: close.price, currency: close.currency } : null;
  };
}

const NAMES: Readonly<Record<string, string>> = { BTC: "Bitcoin" };

function cryptoInstrument(code: string): Instrument | null {
  const id = cryptoInstrumentId(code);
  if (id === null) return null;
  return instrumentSchema.parse({
    id,
    name: NAMES[id] ?? id,
    type: "CRYPTO",
    assetClass: "crypto",
  });
}

export function krakenCryptoIds(rows: readonly KrakenRow[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (isFiat(row)) continue;
    const id = cryptoInstrumentId(row.asset);
    if (id !== null) ids.add(id);
  }
  return [...ids].sort();
}

function isFiat(row: KrakenRow): boolean {
  return row.subclass === "fiat";
}

function abs(value: string): string {
  return new Decimal(value || "0").abs().toFixed();
}

function net(row: KrakenRow): Decimal {
  return new Decimal(row.amount || "0").minus(row.fee || "0");
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

export function isInternalMove(row: KrakenRow): boolean {
  if (row.type === "transfer") return row.subtype !== "useraccounttransfer";
  return row.type === "earn" && INTERNAL_EARN.has(row.subtype ?? "");
}

export function mapGroup(
  rows: KrakenRow[],
  priceAt: PriceAt = () => null,
): MappedItem[] {
  const first = rows[0]!;
  const refid = first.refid;

  if (rows.every(isInternalMove)) return [discard("internal-move", first)];

  const spend = rows.find((r) => r.type === "spend");
  const receive = rows.find((r) => r.type === "receive");
  if (spend && receive && rows.length === 2) {
    const pair = `${spend.asset} → ${receive.asset}`;
    if (isFiat(spend) && isFiat(receive)) return [unsupported(receive)];
    if (!isFiat(spend) && !isFiat(receive))
      return swap(refid, spend, receive, pair, priceAt);
    const crypto = isFiat(spend) ? receive : spend;
    const instrument = cryptoInstrument(crypto.asset);
    if (instrument === null) return [discard("invalid-crypto-code", crypto)];
    return isFiat(spend)
      ? [buy(refid, instrument, spend, receive)]
      : [sell(refid, instrument, receive, spend)];
  }

  if (rows.length !== 1) return [unsupported(first)];

  switch (first.type) {
    case "deposit":
    case "withdrawal":
      if (isFiat(first))
        return [
          cash(
            refid,
            first,
            first.type === "deposit" ? "DEPOSIT" : "WITHDRAWAL",
          ),
        ];
      return [discard("crypto-transfer", first)];
    case "transfer":
      if (!isFiat(first)) return [discard("crypto-transfer", first)];
      return [
        cash(
          refid,
          first,
          new Decimal(first.amount).isNegative() ? "WITHDRAWAL" : "DEPOSIT",
          ACCOUNT_TRANSFER_NOTE,
        ),
        notice("account-transfer", first),
      ];
    case "reward":
      return reward(refid, first, priceAt);
    case "earn":
      return first.subtype === "reward"
        ? reward(refid, first, priceAt)
        : [unsupported(first)];
    default:
      return [unsupported(first)];
  }
}

function tradeEvent(
  refid: string,
  instrument: Instrument,
  type: "BUY" | "SELL",
  fiat: KrakenRow,
  quantity: Decimal,
  fiatAmount: Decimal,
) {
  return tradeEventSchema.parse({
    id: crypto.randomUUID(),
    ts: parseTime(fiat.time),
    type,
    instrumentId: instrument.id,
    quantity: quantity.toFixed(),
    price: quantity.isZero() ? "0" : fiatAmount.dividedBy(quantity).toFixed(),
    grossAmount: fiatAmount.toFixed(),
    fees: abs(fiat.fee),
    currency: fiat.asset,
    account: "kraken",
    source: "KRAKEN_CSV",
    externalId: refid,
    note: null,
  });
}

function buy(
  refid: string,
  instrument: Instrument,
  fiat: KrakenRow,
  received: KrakenRow,
): MappedItem {
  return {
    kind: "domain",
    instrument,
    event: tradeEvent(
      refid,
      instrument,
      "BUY",
      fiat,
      net(received),
      new Decimal(abs(fiat.amount)),
    ),
  };
}

function sell(
  refid: string,
  instrument: Instrument,
  fiat: KrakenRow,
  delivered: KrakenRow,
): MappedItem {
  return {
    kind: "domain",
    instrument,
    event: tradeEvent(
      refid,
      instrument,
      "SELL",
      fiat,
      net(delivered).abs(),
      new Decimal(abs(fiat.amount)),
    ),
  };
}

interface SwapLegValue {
  gross: Decimal;
  fee: Decimal;
  currency: string;
  valuationSource: ValuationSource;
}

function swapLegValue(
  row: KrakenRow,
  instrument: Instrument,
  priceAt: PriceAt,
  received: boolean,
): SwapLegValue | null {
  const fee = new Decimal(row.fee || "0");
  const amount = new Decimal(row.amount || "0").abs();

  if (row.amountusd && (fee.isZero() || row.feeusd)) {
    const usd = new Decimal(row.amountusd).abs();
    const feeUsd = new Decimal(row.feeusd || "0");
    return {
      gross: received ? usd : usd.plus(feeUsd),
      fee: received ? feeUsd : new Decimal(0),
      currency: "USD",
      valuationSource: "kraken-amountusd",
    };
  }

  const priced = priceAt(instrument.id, parseTime(row.time));
  if (priced === null) return null;
  const worth = (quantity: Decimal) =>
    new Decimal(
      Money.fromString(priced.price).scaleBy(quantity.toFixed()).toString(),
    );
  return {
    gross: received ? worth(amount) : worth(amount.plus(fee)),
    fee: received ? worth(fee) : new Decimal(0),
    currency: priced.currency,
    valuationSource: "yahoo",
  };
}

function swap(
  refid: string,
  spend: KrakenRow,
  receive: KrakenRow,
  pair: string,
  priceAt: PriceAt,
): MappedItem[] {
  const delivered = cryptoInstrument(spend.asset);
  const arrived = cryptoInstrument(receive.asset);
  if (delivered === null) return [discard("invalid-crypto-code", spend)];
  if (arrived === null) return [discard("invalid-crypto-code", receive)];

  const deliveredQuantity = net(spend).abs();
  const receivedQuantity = net(receive);
  if (deliveredQuantity.isZero() || !receivedQuantity.isPositive())
    return [unsupported(receive)];

  const out = swapLegValue(spend, delivered, priceAt, false);
  const into = swapLegValue(receive, arrived, priceAt, true);
  if (out === null || into === null) {
    const unpriced = [
      ...(out === null ? [delivered.id] : []),
      ...(into === null ? [arrived.id] : []),
    ];
    return [
      {
        kind: "discard",
        reason: "swap-unpriced",
        detail: {
          ...detailOf(receive, pair),
          unpriced,
        },
        instrument: delivered,
        related: [arrived],
      },
    ];
  }

  const leg = (
    type: "BUY" | "SELL",
    row: KrakenRow,
    instrument: Instrument,
    quantity: Decimal,
    value: SwapLegValue,
    suffix: "buy" | "sell",
  ) =>
    tradeEventSchema.parse({
      id: crypto.randomUUID(),
      ts: parseTime(row.time),
      type,
      instrumentId: instrument.id,
      quantity: quantity.toFixed(),
      price: value.gross.minus(value.fee).dividedBy(quantity).toFixed(),
      grossAmount: value.gross.toFixed(),
      fees: value.fee.toFixed(),
      currency: value.currency,
      account: "kraken",
      source: "KRAKEN_CSV",
      externalId: `${refid}:${suffix}`,
      note: null,
      linkId: refid,
      linkKind: "swap",
      valuationSource: value.valuationSource,
    });

  return [
    {
      kind: "domain",
      instrument: delivered,
      event: leg("SELL", spend, delivered, deliveredQuantity, out, "sell"),
    },
    {
      kind: "domain",
      instrument: arrived,
      event: leg("BUY", receive, arrived, receivedQuantity, into, "buy"),
    },
  ];
}

interface RewardValue {
  price: string;
  grossAmount: string;
  currency: string;
  valuationSource: ValuationSource;
}

function valueAtKraken(row: KrakenRow, quantity: Decimal): RewardValue | null {
  if (!row.amountusd) return null;
  const usd = new Decimal(row.amountusd).minus(row.feeusd || "0");
  return {
    price: usd.dividedBy(quantity).toFixed(),
    grossAmount: usd.toFixed(),
    currency: "USD",
    valuationSource: "kraken-amountusd",
  };
}

function valueFromHistory(
  instrument: Instrument,
  ts: Date,
  quantity: Decimal,
  priceAt: PriceAt,
): RewardValue | null {
  const priced = priceAt(instrument.id, ts);
  if (priced === null) return null;
  return {
    price: priced.price,
    grossAmount: Money.fromString(priced.price)
      .scaleBy(quantity.toFixed())
      .toString(),
    currency: priced.currency,
    valuationSource: "yahoo",
  };
}

/**
 * A reward is an acquisition with no counter-leg, so it needs two ledger
 * rows sharing one market value: an IN_KIND BUY that becomes the FIFO/AVCO
 * lot's acquisition cost, and an IN_KIND DIVIDEND recording the same value as
 * income. Its tax classification is not settled, and nothing fiscal reads it.
 * One event doing both jobs is what hid the income in the original bug —
 * see CLAUDE.md "Kraken rewards". The two rows share `refid` as a prefix
 * but need distinct `externalId`s to both survive the (source, externalId)
 * dedup key.
 */
function reward(refid: string, row: KrakenRow, priceAt: PriceAt): MappedItem[] {
  const instrument = cryptoInstrument(row.asset);
  if (instrument === null) return [discard("invalid-crypto-code", row)];

  const ts = parseTime(row.time);
  const quantity = net(row);
  if (!quantity.isPositive()) return [unsupported(row)];

  const value =
    valueAtKraken(row, quantity) ??
    valueFromHistory(instrument, ts, quantity, priceAt);
  if (value === null)
    return [{ ...discard("reward-unpriced", row), instrument }];

  const acquisition: MappedItem = {
    kind: "domain",
    instrument,
    event: tradeEventSchema.parse({
      id: crypto.randomUUID(),
      ts,
      type: "BUY",
      instrumentId: instrument.id,
      quantity: quantity.toFixed(),
      price: value.price,
      grossAmount: value.grossAmount,
      fees: "0",
      funding: "IN_KIND",
      currency: value.currency,
      account: "kraken",
      source: "KRAKEN_CSV",
      externalId: refid,
      note: REWARD_NOTE,
      valuationSource: value.valuationSource,
    }),
  };

  const income: MappedItem = {
    kind: "domain",
    instrument: null,
    event: dividendEventSchema.parse({
      id: crypto.randomUUID(),
      ts,
      type: "DIVIDEND",
      instrumentId: instrument.id,
      grossAmount: value.grossAmount,
      taxWithheld: "0",
      funding: "IN_KIND",
      currency: value.currency,
      account: "kraken",
      source: "KRAKEN_CSV",
      externalId: `${refid}:income`,
      note: "kraken-reward-income",
      valuationSource: value.valuationSource,
    }),
  };

  return [acquisition, income];
}

/**
 * A deposit or withdrawal in another fiat currency is booked in euros at the
 * ECB rate of its own day, like the trade it funds, so Movements shows the
 * money arriving that the purchase then spends. What is not modelled is the
 * balance held in that currency in between: Quoin keeps no cash position per
 * currency, so the gain or loss from the rate moving between the deposit and
 * the purchase (or the sale and the withdrawal) appears nowhere.
 */
function cash(
  refid: string,
  row: KrakenRow,
  type: "DEPOSIT" | "WITHDRAWAL",
  note: string | null = null,
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
      account: "kraken",
      source: "KRAKEN_CSV",
      externalId: refid,
      note,
    }),
  };
}
