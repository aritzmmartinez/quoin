import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  answerPrices,
  type PriceHolding,
  type PriceRow,
  type StoredPrices,
} from "../../app/core/sync/prices";

import { contractJson } from "./build";

export interface SyncPricesInput {
  name: string;
  stored: StoredPrices;
  holding: PriceHolding;
  pending: boolean;
}

export const SYNC_PRICES_CONTRACT_FILE = fileURLToPath(
  new URL("./sync-prices.json", import.meta.url),
);

const ID = "IE00TEST0301";
const VERSION = "series-a";

const row = (asOf: string, price = "10", source = "YAHOO"): PriceRow => ({
  asOf,
  price,
  currency: "EUR",
  source,
});
const rows = [
  row("2026-10-01T07:00:00.000Z"),
  row("2026-10-02T07:00:00.000Z"),
  row("2026-10-09T07:00:00.000Z"),
  row("2026-10-12T07:00:00.000Z"),
  row("2026-10-13T07:00:00.000Z"),
  row("2026-10-14T15:30:00.000Z", "11", "YAHOO_LIVE"),
];
const stored: StoredPrices = { seriesVersion: VERSION, rows };
const holding = (extra: Partial<PriceHolding> = {}): PriceHolding => ({
  instrumentId: ID,
  seriesVersion: VERSION,
  last: "2026-10-13T07:00:00.000Z",
  ...extra,
});

const cases: (SyncPricesInput & {
  byHand?: { arithmetic: string; figures: Record<string, string | null> };
})[] = [
  {
    name: "the same version: the last week again, so a replaced live row heals",
    stored,
    holding: holding(),
    pending: false,
    byHand: {
      arithmetic:
        "last 2026-10-13T07:00Z minus 7 days is 2026-10-06T07:00Z, so a tail of the 4 rows from 10-09 on.",
      figures: {
        kind: "tail",
        from: "2026-10-06T07:00:00.000Z",
        seriesVersion: VERSION,
      },
    },
  },
  {
    name: "a window boundary is inclusive",
    stored: { seriesVersion: VERSION, rows: rows.slice(0, 3) },
    holding: holding({ last: "2026-10-16T07:00:00.000Z" }),
    pending: false,
    byHand: {
      arithmetic:
        "2026-10-16T07:00Z minus 7 days is exactly 10-09T07:00Z, the third row, which belongs to the tail.",
      figures: {
        kind: "tail",
        from: "2026-10-09T07:00:00.000Z",
        "rows.0.asOf": "2026-10-09T07:00:00.000Z",
      },
    },
  },
  {
    name: "the same last written in another offset is the same instant",
    stored,
    holding: holding({ last: "2026-10-13T09:00:00+02:00" }),
    pending: false,
  },
  {
    name: "a phone newer than every row gets an empty tail",
    stored,
    holding: holding({ last: "2026-11-01T07:00:00.000Z" }),
    pending: false,
  },
  {
    name: "a phone with nothing gets everything",
    stored,
    holding: holding({ seriesVersion: null, last: null }),
    pending: false,
  },
  {
    name: "another version is another series",
    stored,
    holding: holding({ seriesVersion: "series-b" }),
    pending: false,
  },
  {
    name: "rows reported with no version are never taken for this series",
    stored,
    holding: holding({ seriesVersion: null }),
    pending: false,
  },
  {
    name: "a download still under way answers pending, whatever the phone holds",
    stored: { seriesVersion: VERSION, rows: [] },
    holding: holding(),
    pending: true,
  },
  {
    name: "no rows and nothing under way is an empty full answer, never pending",
    stored: { seriesVersion: VERSION, rows: [] },
    holding: holding(),
    pending: false,
  },
  {
    name: "an instrument the computer does not know",
    stored: { seriesVersion: "series-unsaved", rows: [] },
    holding: holding({ seriesVersion: null, last: null }),
    pending: false,
  },
];

export const evaluate = ({ stored, holding, pending }: SyncPricesInput) =>
  answerPrices(stored, holding, pending);

export function syncPricesContractJson(): string {
  return contractJson(
    "sync-prices",
    "What the computer answers to POST /v1/prices for one instrument the phone reports, given what it stores. Shared with the mobile client, which applies the answers: pending changes nothing and asks again later; full replaces every row of the instrument; tail deletes the rows at or after `from` and writes `rows`. Full and tail always carry a seriesVersion, never null, which the phone keeps and sends back with its newest row as `last`; a phone with nothing sends null for both. A version is compared for equality only. Instants are compared as instants, whatever offset they are written in.",
    cases.map((c) => ({ ...c, expect: evaluate(c) })),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(SYNC_PRICES_CONTRACT_FILE, syncPricesContractJson());
}
