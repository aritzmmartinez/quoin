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
const SYMBOL = "TEST.DE";

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
const stored: StoredPrices = { quoteSymbol: SYMBOL, rows };
const holding = (extra: Partial<PriceHolding> = {}): PriceHolding => ({
  instrumentId: ID,
  quoteSymbol: SYMBOL,
  first: "2026-10-01T07:00:00.000Z",
  last: "2026-10-13T07:00:00.000Z",
  count: 5,
  ...extra,
});

const cases: (SyncPricesInput & {
  byHand?: { arithmetic: string; figures: Record<string, string | null> };
})[] = [
  {
    name: "a phone up to date to a day: the last week again, so a replaced live row heals",
    stored,
    holding: holding(),
    pending: false,
    byHand: {
      arithmetic:
        "last 2026-10-13T07:00Z minus 7 days is 2026-10-06T07:00Z. Two rows lie before it, and the phone's 5 is within 2 and 2 + 16, so a tail of the 4 rows from 10-09 on.",
      figures: { kind: "tail", from: "2026-10-06T07:00:00.000Z" },
    },
  },
  {
    name: "a window boundary is inclusive",
    stored: { quoteSymbol: SYMBOL, rows: rows.slice(0, 3) },
    holding: holding({
      first: "2026-10-01T07:00:00.000Z",
      last: "2026-10-16T07:00:00.000Z",
      count: 3,
    }),
    pending: false,
    byHand: {
      arithmetic:
        "2026-10-16T07:00Z minus 7 days is exactly 10-09T07:00Z, the third row, which belongs to the tail.",
      figures: { kind: "tail", from: "2026-10-09T07:00:00.000Z" },
    },
  },
  {
    name: "a phone with nothing gets everything",
    stored,
    holding: holding({ first: null, last: null, count: 0 }),
    pending: false,
  },
  {
    name: "another symbol is another series",
    stored,
    holding: holding({ quoteSymbol: "OTHER.DE" }),
    pending: false,
  },
  {
    name: "a history that starts elsewhere was rebuilt",
    stored,
    holding: holding({ first: "2026-09-01T07:00:00.000Z" }),
    pending: false,
  },
  {
    name: "the same start written in another offset is the same instant",
    stored,
    holding: holding({ first: "2026-10-01T09:00:00+02:00" }),
    pending: false,
  },
  {
    name: "a phone short of older rows gets everything",
    stored,
    holding: holding({ count: 1 }),
    pending: false,
  },
  {
    name: "a phone with far more rows than the window can explain gets everything",
    stored,
    holding: holding({ count: 19 }),
    pending: false,
  },
  {
    name: "a download still under way answers pending, whatever the phone holds",
    stored: { quoteSymbol: SYMBOL, rows: [] },
    holding: holding(),
    pending: true,
  },
  {
    name: "no rows and nothing under way is an empty full answer, never pending",
    stored: { quoteSymbol: SYMBOL, rows: [] },
    holding: holding(),
    pending: false,
  },
  {
    name: "an instrument the computer does not know",
    stored: { quoteSymbol: null, rows: [] },
    holding: holding({ first: null, last: null, count: 0 }),
    pending: false,
  },
];

export const evaluate = ({ stored, holding, pending }: SyncPricesInput) =>
  answerPrices(stored, holding, pending);

export function syncPricesContractJson(): string {
  return contractJson(
    "sync-prices",
    "What the computer answers to POST /v1/prices for one instrument the phone reports, given what it stores. Shared with the mobile client, which applies the answers: pending changes nothing and asks again later; full replaces every row of the instrument; tail deletes the rows at or after `from` and writes `rows`. Instants are compared as instants, whatever offset they are written in.",
    cases.map((c) => ({ ...c, expect: evaluate(c) })),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(SYNC_PRICES_CONTRACT_FILE, syncPricesContractJson());
}
