import type { RowTypeKey } from "./discard";
import { KRAKEN_ROW_TYPES } from "./kraken/row-types";
import { TRADE_REPUBLIC_ROW_TYPES } from "./trade-republic/row-types";

export const BROKERS = ["trade-republic", "kraken"] as const;

export type Broker = (typeof BROKERS)[number];

const SIGNATURES: Readonly<Record<Broker, string>> = {
  "trade-republic": "transaction_id",
  kraken: "refid",
};

export const BROKER_ROW_TYPES: Readonly<
  Record<Broker, Readonly<Record<string, RowTypeKey>>>
> = {
  "trade-republic": TRADE_REPUBLIC_ROW_TYPES,
  kraken: KRAKEN_ROW_TYPES,
};

export function detectBroker(csv: string): Broker | null {
  const header = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .find((line) => line.trim() !== "");
  if (header === undefined) return null;

  const columns = new Set(
    header.split(/[,;\t|]/).map((cell) =>
      cell
        .trim()
        .replace(/^"(.*)"$/, "$1")
        .trim()
        .toLowerCase(),
    ),
  );
  const matched = BROKERS.filter((broker) => columns.has(SIGNATURES[broker]));

  return matched.length === 1 ? matched[0]! : null;
}
