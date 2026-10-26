import Decimal from "decimal.js";

export interface KrakenFixtureRow {
  refid: string;
  time: string;
  type: string;
  subtype?: string;
  subclass: string;
  asset: string;
  wallet?: string;
  amount: string;
  fee?: string;
  amountusd?: string;
  feeusd?: string;
  feecurrency?: string;
  balance?: string;
}

export const KRAKEN_HEADER =
  "txid,refid,time,type,subtype,aclass,subclass,asset,wallet,amount,fee,balance,amountusd,feeusd,balanceusd,feecurrency";

const quoted = (value: string) => `"${value}"`;

export function krakenCsv(rows: readonly KrakenFixtureRow[]): string {
  const held = new Map<string, Decimal>();
  const lines = rows.map((row, index) => {
    const wallet = row.wallet ?? "spot / main";
    const fee = row.fee ?? "0";
    const key = `${row.asset}\u0000${wallet}`;
    const running = (held.get(key) ?? new Decimal(0))
      .plus(row.amount)
      .minus(fee);
    held.set(key, running);
    return [
      quoted(`L${index + 1}`),
      quoted(row.refid),
      quoted(row.time),
      quoted(row.type),
      quoted(row.subtype ?? ""),
      quoted("currency"),
      quoted(row.subclass),
      quoted(row.asset),
      quoted(wallet),
      row.amount,
      fee,
      row.balance ?? running.toFixed(),
      row.amountusd ?? "",
      row.feeusd ?? "",
      "",
      quoted(row.feecurrency ?? ""),
    ].join(",");
  });
  return [KRAKEN_HEADER, ...lines].join("\n");
}
