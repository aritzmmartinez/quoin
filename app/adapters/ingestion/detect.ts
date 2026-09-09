import Papa from "papaparse";

export const BROKERS = ["trade-republic", "kraken"] as const;

export type Broker = (typeof BROKERS)[number];

const SIGNATURES: Readonly<Record<Broker, string>> = {
  "trade-republic": "transaction_id",
  kraken: "refid",
};

export function detectBroker(csv: string): Broker | null {
  const header = Papa.parse<string[]>(csv, {
    preview: 1,
    skipEmptyLines: "greedy",
  }).data[0];
  if (!header) return null;

  const columns = new Set(
    header.map((cell) =>
      cell
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase(),
    ),
  );
  const matched = BROKERS.filter((broker) => columns.has(SIGNATURES[broker]));

  return matched.length === 1 ? matched[0]! : null;
}
