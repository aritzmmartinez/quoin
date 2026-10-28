import { z } from "zod";

import { parseHlc } from "./hlc";

export const SCHEMA_VERSION = 1;

const hlc = z.string().refine((value) => {
  try {
    parseHlc(value);
    return true;
  } catch {
    return false;
  }
}, "Not a sync mark");
const mark = hlc.nullable().default(null);
const text = z.string().nullable().default(null);
const instant = z.iso.datetime({ offset: true });
const day = z.iso.date();

export const ledgerRowSchema = z.object({
  source: z.string().min(1),
  externalId: z.string().min(1),
  ts: instant,
  type: z.enum([
    "BUY",
    "SELL",
    "DIVIDEND",
    "DEPOSIT",
    "WITHDRAWAL",
    "INTEREST",
  ]),
  instrumentId: text,
  quantity: text,
  price: text,
  grossAmount: z.string(),
  fees: z.string().default("0"),
  taxWithheld: z.string().default("0"),
  currency: z.string(),
  fxSource: z.string().default("IDENTITY"),
  fxDate: text,
  fxRate: text,
  fxDirection: text,
  originalAmount: text,
  originalCurrency: text,
  valuationSource: text,
  linkId: text,
  linkKind: text,
  funding: z.enum(["CASH", "IN_KIND"]).default("CASH"),
  account: z.string(),
  note: text,
});
export type LedgerRow = z.infer<typeof ledgerRowSchema>;

export const instrumentRowSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.string(),
  assetClass: text,
  quoteSymbol: text,
  quoteSymbolHlc: mark,
  exposureKind: text,
  exposureLeafId: text,
  exposureHlc: mark,
  ter: text,
  terHlc: mark,
  hedgedToBase: z.boolean().default(false),
  hedgedToBaseHlc: mark,
  thesis: z.string().default("CORE"),
  thesisHlc: mark,
});
export type InstrumentRow = z.infer<typeof instrumentRowSchema>;

export const targetRowSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  activeFrom: day,
  note: text,
  createdAt: instant,
  lines: z.array(
    z.object({ instrumentId: z.string(), monthlyAmount: z.string() }),
  ),
});
export type TargetRow = z.infer<typeof targetRowSchema>;

export const TARGET_ENTITY = "PortfolioTarget";

export const tombstoneSchema = z.object({
  entity: z.literal(TARGET_ENTITY),
  key: z.string().min(1),
  hlc,
});
export type Tombstone = z.infer<typeof tombstoneSchema>;

export const holdingsBlockSchema = z.object({
  instrumentId: z.string().min(1),
  asOf: day,
  asOfInferred: z.boolean(),
  hlc: mark,
  rows: z.array(
    z.object({
      identity: z.string().min(1),
      identityKind: z.enum(["ISIN", "TICKER"]),
      name: z.string(),
      weight: z.string(),
    }),
  ),
});
export type HoldingsBlockRow = z.infer<typeof holdingsBlockSchema>;

export const identityRowSchema = z.object({
  identity: z.string().min(1),
  identityKind: z.enum(["ISIN", "TICKER"]),
  canonicalId: text,
  exchCode: text,
  status: z.enum(["resolved", "not-found", "ambiguous"]),
  source: z.string(),
  resolvedAt: instant,
});
export type IdentityRow = z.infer<typeof identityRowSchema>;

export const settingsRowSchema = z.object({
  residence: z.string(),
  residenceHlc: mark,
});
export type SettingsRow = z.infer<typeof settingsRowSchema>;

export const peerSchema = z.object({ deviceId: z.string().min(1), seen: hlc });
export type Peer = z.infer<typeof peerSchema>;

export const syncStateSchema = z.object({
  deviceId: z.string().min(1),
  peers: z.array(peerSchema).default([]),
  ledger: z.array(ledgerRowSchema).default([]),
  instruments: z.array(instrumentRowSchema).default([]),
  targets: z.array(targetRowSchema).default([]),
  tombstones: z.array(tombstoneSchema).default([]),
  holdings: z.array(holdingsBlockSchema).default([]),
  identities: z.array(identityRowSchema).default([]),
  settings: settingsRowSchema,
});

export type SyncState = z.infer<typeof syncStateSchema>;

export const exchangeSchema = syncStateSchema
  .extend({
    schemaVersion: z.literal(SCHEMA_VERSION),
    deviceName: text,
    exportHlc: hlc,
  })
  .superRefine((file, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (parseHlc(file.exportHlc).deviceId !== file.deviceId) {
      issue("The export mark belongs to another device");
    }
    const keys = new Set<string>();
    const legs = new Map<string, number>();
    for (const row of file.ledger) {
      const key = ledgerKey(row);
      if (keys.has(key)) issue(`Ledger entry ${key} appears twice`);
      keys.add(key);
      if (row.linkId != null) {
        const link = `${row.source}::${row.linkId}`;
        legs.set(link, (legs.get(link) ?? 0) + 1);
      }
    }
    for (const [link, count] of legs) {
      if (count !== 2)
        issue(`Linked operation ${link} has ${count} legs, not 2`);
    }
    const instruments = new Set(file.instruments.map((i) => i.id));
    for (const id of [
      ...file.ledger.flatMap((row) =>
        row.instrumentId ? [row.instrumentId] : [],
      ),
      ...file.holdings.map((block) => block.instrumentId),
    ]) {
      if (!instruments.has(id))
        issue(`Instrument ${id} is referenced but not included`);
    }
  });
export type Exchange = z.infer<typeof exchangeSchema>;

export function ledgerKey(row: { source: string; externalId: string }): string {
  return `${row.source}::${row.externalId}`;
}

export class UnsupportedSchemaVersionError extends Error {
  constructor(readonly found: unknown) {
    super(
      `This file is sync format version ${JSON.stringify(found)}; this version of Quoin reads version ${SCHEMA_VERSION} only.`,
    );
    this.name = "UnsupportedSchemaVersionError";
  }
}

export function parseExchange(raw: unknown): Exchange {
  const version =
    typeof raw === "object" && raw !== null && "schemaVersion" in raw
      ? raw.schemaVersion
      : undefined;
  if (version !== SCHEMA_VERSION)
    throw new UnsupportedSchemaVersionError(version);
  return exchangeSchema.parse(raw);
}
