import {
  ledgerKey,
  type Exchange,
  type HoldingsBlockRow,
  type IdentityRow,
  type InstrumentRow,
  type LedgerRow,
  type Peer,
  type SettingsRow,
  type SyncState,
  type TargetRow,
  type Tombstone,
} from "./exchange";
import { originOf } from "./hlc";

export type Conflict =
  | {
      kind: "field";
      entity: "instrument" | "settings";
      key: string;
      field: string;
      local: unknown;
      incoming: unknown;
    }
  | { kind: "ledger"; key: string; fields: string[] }
  | { kind: "target"; id: string }
  | { kind: "target-day"; day: string; ids: string[] }
  | { kind: "holdings"; instrumentId: string };

export type Effect =
  | { kind: "prices"; instrumentId: string; symbol: string }
  | { kind: "rates"; currency: string; since: string };

export interface MergePlan {
  apply: {
    ledger: { insert: LedgerRow[]; markInKind: string[] };
    instruments: {
      insert: InstrumentRow[];
      update: { id: string; patch: Partial<InstrumentRow> }[];
    };
    targets: { insert: TargetRow[]; delete: string[] };
    tombstones: Tombstone[];
    holdings: HoldingsBlockRow[];
    identities: IdentityRow[];
    settings: Partial<SettingsRow> | null;
    peers: Peer[];
  };
  conflicts: Conflict[];
  effects: Effect[];
}

export class SameDeviceError extends Error {
  constructor(deviceId: string) {
    super(
      `The file was exported by this same database (${deviceId}). A copied database file keeps its device id; it cannot sync with its own copy.`,
    );
    this.name = "SameDeviceError";
  }
}

const BASE_CURRENCY = "EUR";

interface Side {
  self: string;
  seen: ReadonlyMap<string, string>;
}

function isNewFor(side: Side, mark: string | null): boolean {
  if (mark === null) return false;
  const origin = originOf(mark);
  if (origin === side.self) return false;
  const seen = side.seen.get(origin);
  return seen === undefined || mark > seen;
}

type Decision = "keep" | "take" | "conflict";

function decide(
  me: Side,
  them: Side,
  local: string | null,
  incoming: string | null,
): Decision {
  const takeIt = isNewFor(me, incoming);
  const keepIt = isNewFor(them, local);
  if (takeIt && !keepIt) return "take";
  if (keepIt && !takeIt) return "keep";
  return "conflict";
}

const effectKey = (effect: Effect) =>
  effect.kind === "prices"
    ? `prices:${effect.instrumentId}`
    : `rates:${effect.currency}`;
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const byKey = <T>(rows: readonly T[], key: (row: T) => string) =>
  new Map(rows.map((row) => [key(row), row] as const));

const INSTRUMENT_FIELDS = {
  quoteSymbol: { mark: "quoteSymbolHlc", values: ["quoteSymbol"] },
  exposure: { mark: "exposureHlc", values: ["exposureKind", "exposureLeafId"] },
  ter: { mark: "terHlc", values: ["ter"] },
  hedgedToBase: { mark: "hedgedToBaseHlc", values: ["hedgedToBase"] },
  thesis: { mark: "thesisHlc", values: ["thesis"] },
} as const satisfies Record<
  string,
  { mark: keyof InstrumentRow; values: readonly (keyof InstrumentRow)[] }
>;

export function merge(local: SyncState, incoming: Exchange): MergePlan {
  if (incoming.deviceId === local.deviceId) {
    throw new SameDeviceError(local.deviceId);
  }
  const me: Side = {
    self: local.deviceId,
    seen: new Map(local.peers.map((p) => [p.deviceId, p.seen])),
  };
  const them: Side = {
    self: incoming.deviceId,
    seen: new Map(incoming.peers.map((p) => [p.deviceId, p.seen])),
  };

  const conflicts: Conflict[] = [];
  const effects: Effect[] = [];

  const ledger = mergeLedger(local.ledger, incoming.ledger, conflicts, effects);
  const instruments = mergeInstruments(
    local.instruments,
    incoming.instruments,
    me,
    them,
    conflicts,
    effects,
  );
  const { targets, tombstones } = mergeTargets(local, incoming, conflicts);
  const holdings = mergeHoldings(
    local.holdings,
    incoming.holdings,
    me,
    them,
    conflicts,
  );
  const identities = mergeIdentities(local.identities, incoming.identities);

  let settings: Partial<SettingsRow> | null = null;
  if (local.settings.residence !== incoming.settings.residence) {
    const decision = decide(
      me,
      them,
      local.settings.residenceHlc,
      incoming.settings.residenceHlc,
    );
    if (decision === "take") settings = incoming.settings;
    if (decision === "conflict") {
      conflicts.push({
        kind: "field",
        entity: "settings",
        key: "settings",
        field: "residence",
        local: local.settings.residence,
        incoming: incoming.settings.residence,
      });
    }
  }

  return {
    apply: {
      ledger,
      instruments,
      targets,
      tombstones,
      holdings,
      identities,
      settings,
      peers: mergeSeen(me, them, incoming.exportHlc),
    },
    conflicts,
    effects: effects.sort((a, b) => effectKey(a).localeCompare(effectKey(b))),
  };
}

const LEDGER_COMPARED = [
  "type",
  "instrumentId",
  "quantity",
  "price",
  "grossAmount",
  "fees",
  "taxWithheld",
  "currency",
  "fxSource",
  "fxDate",
  "fxRate",
  "fxDirection",
  "originalAmount",
  "originalCurrency",
  "valuationSource",
  "linkId",
  "linkKind",
  "account",
  "note",
] as const;

function mergeLedger(
  local: readonly LedgerRow[],
  incoming: readonly LedgerRow[],
  conflicts: Conflict[],
  effects: Effect[],
): MergePlan["apply"]["ledger"] {
  const stored = byKey(local, ledgerKey);
  const insert: LedgerRow[] = [];
  const markInKind: string[] = [];
  const blockedLinks = new Set<string>();

  for (const row of incoming) {
    const key = ledgerKey(row);
    const mine = stored.get(key);
    if (!mine) continue;
    const fields: string[] = LEDGER_COMPARED.filter((f) => mine[f] !== row[f]);
    if (Date.parse(mine.ts) !== Date.parse(row.ts)) fields.unshift("ts");
    if (fields.length > 0) {
      conflicts.push({ kind: "ledger", key, fields });
      if (row.linkId != null) blockedLinks.add(`${row.source}::${row.linkId}`);
    } else if (mine.funding === "CASH" && row.funding === "IN_KIND") {
      markInKind.push(key);
    }
  }

  const since = new Map<string, string>();
  for (const row of incoming) {
    if (stored.has(ledgerKey(row))) continue;
    if (
      row.linkId != null &&
      blockedLinks.has(`${row.source}::${row.linkId}`)
    ) {
      continue;
    }
    insert.push(row);
    if (row.currency !== BASE_CURRENCY) {
      const first = since.get(row.currency);
      if (!first || Date.parse(row.ts) < Date.parse(first)) {
        since.set(row.currency, row.ts);
      }
    }
  }
  for (const [currency, ts] of since) {
    effects.push({ kind: "rates", currency, since: ts });
  }

  return {
    insert: insert.sort((a, b) => ledgerKey(a).localeCompare(ledgerKey(b))),
    markInKind: markInKind.sort(),
  };
}

function mergeInstruments(
  local: readonly InstrumentRow[],
  incoming: readonly InstrumentRow[],
  me: Side,
  them: Side,
  conflicts: Conflict[],
  effects: Effect[],
): MergePlan["apply"]["instruments"] {
  const stored = byKey(local, (row) => row.id);
  const insert: InstrumentRow[] = [];
  const update: { id: string; patch: Partial<InstrumentRow> }[] = [];

  for (const row of incoming) {
    const mine = stored.get(row.id);
    if (!mine) {
      insert.push(row);
      if (row.quoteSymbol) {
        effects.push({
          kind: "prices",
          instrumentId: row.id,
          symbol: row.quoteSymbol,
        });
      }
      continue;
    }

    const patch: Record<string, unknown> = {};
    if (mine.assetClass === null && row.assetClass !== null) {
      patch.assetClass = row.assetClass;
    }
    for (const [field, { mark, values }] of Object.entries(INSTRUMENT_FIELDS)) {
      if (values.every((v) => mine[v] === row[v])) continue;
      const decision = decide(me, them, mine[mark], row[mark]);
      if (decision === "take") {
        for (const v of values) patch[v] = row[v];
        patch[mark] = row[mark];
      } else if (decision === "conflict") {
        conflicts.push({
          kind: "field",
          entity: "instrument",
          key: row.id,
          field,
          local:
            values.length === 1 ? mine[values[0]!] : values.map((v) => mine[v]),
          incoming:
            values.length === 1 ? row[values[0]!] : values.map((v) => row[v]),
        });
      }
    }
    if (Object.keys(patch).length > 0) {
      update.push({ id: row.id, patch: patch as Partial<InstrumentRow> });
    }
    if ("quoteSymbol" in patch && row.quoteSymbol) {
      effects.push({
        kind: "prices",
        instrumentId: row.id,
        symbol: row.quoteSymbol,
      });
    }
  }

  return {
    insert: insert.sort((a, b) => a.id.localeCompare(b.id)),
    update: update.sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function mergeTargets(
  local: SyncState,
  incoming: Exchange,
  conflicts: Conflict[],
): { targets: MergePlan["apply"]["targets"]; tombstones: Tombstone[] } {
  const buried = new Set(local.tombstones.map((t) => t.key));
  const tombstones = incoming.tombstones
    .filter((t) => !buried.has(t.key))
    .sort((a, b) => a.key.localeCompare(b.key));
  const dead = new Set([...buried, ...tombstones.map((t) => t.key)]);

  const stored = byKey(local.targets, (t) => t.id);
  const insert: TargetRow[] = [];
  for (const target of incoming.targets) {
    if (dead.has(target.id)) continue;
    const mine = stored.get(target.id);
    if (!mine) insert.push(target);
    else if (!same(mine, target))
      conflicts.push({ kind: "target", id: target.id });
  }
  const remove = local.targets
    .filter((t) => dead.has(t.id))
    .map((t) => t.id)
    .sort();

  const byDay = new Map<string, string[]>();
  for (const target of [
    ...local.targets.filter((t) => !dead.has(t.id)),
    ...insert,
  ]) {
    byDay.set(target.activeFrom, [
      ...(byDay.get(target.activeFrom) ?? []),
      target.id,
    ]);
  }
  for (const [day, ids] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) {
    if (ids.length > 1)
      conflicts.push({ kind: "target-day", day, ids: ids.sort() });
  }

  return {
    targets: {
      insert: insert.sort((a, b) => a.id.localeCompare(b.id)),
      delete: remove,
    },
    tombstones,
  };
}

function mergeHoldings(
  local: readonly HoldingsBlockRow[],
  incoming: readonly HoldingsBlockRow[],
  me: Side,
  them: Side,
  conflicts: Conflict[],
): HoldingsBlockRow[] {
  const stored = byKey(local, (b) => b.instrumentId);
  const replace: HoldingsBlockRow[] = [];
  const sortedRows = (b: HoldingsBlockRow) =>
    [...b.rows].sort((x, y) => x.identity.localeCompare(y.identity));

  for (const block of incoming) {
    const mine = stored.get(block.instrumentId);
    if (!mine) {
      replace.push(block);
      continue;
    }
    const sameRows = same(sortedRows(mine), sortedRows(block));
    if (
      sameRows &&
      mine.asOf === block.asOf &&
      mine.asOfInferred === block.asOfInferred
    ) {
      continue;
    }
    const decision = decide(me, them, mine.hlc, block.hlc);
    if (decision === "take") replace.push(block);
    if (decision !== "conflict") continue;

    const bothRead = !mine.asOfInferred && !block.asOfInferred;
    if (bothRead && mine.asOf !== block.asOf) {
      if (block.asOf > mine.asOf) replace.push(block);
    } else if (sameRows) {
      if (mine.asOfInferred && !block.asOfInferred) replace.push(block);
    } else {
      conflicts.push({ kind: "holdings", instrumentId: block.instrumentId });
    }
  }
  return replace.sort((a, b) => a.instrumentId.localeCompare(b.instrumentId));
}

function prefersIncoming(mine: IdentityRow, theirs: IdentityRow): boolean {
  const mineResolved = mine.status === "resolved";
  const theirsResolved = theirs.status === "resolved";
  if (mineResolved !== theirsResolved) return theirsResolved;
  if (
    mineResolved &&
    mine.canonicalId === theirs.canonicalId &&
    (mine.exchCode === null) !== (theirs.exchCode === null)
  ) {
    return theirs.exchCode !== null;
  }
  return Date.parse(theirs.resolvedAt) > Date.parse(mine.resolvedAt);
}

function mergeIdentities(
  local: readonly IdentityRow[],
  incoming: readonly IdentityRow[],
): IdentityRow[] {
  const stored = byKey(local, (row) => row.identity);
  return incoming
    .filter((row) => {
      const mine = stored.get(row.identity);
      return !mine || (!same(mine, row) && prefersIncoming(mine, row));
    })
    .sort((a, b) => a.identity.localeCompare(b.identity));
}

function mergeSeen(me: Side, them: Side, exportHlc: string): Peer[] {
  const seen = new Map(me.seen);
  const raise = (deviceId: string, mark: string) => {
    if (deviceId === me.self) return;
    const current = seen.get(deviceId);
    if (current === undefined || mark > current) seen.set(deviceId, mark);
  };
  for (const [deviceId, mark] of them.seen) raise(deviceId, mark);
  raise(them.self, exportHlc);
  return [...seen]
    .map(([deviceId, mark]) => ({ deviceId, seen: mark }))
    .sort((a, b) => a.deviceId.localeCompare(b.deviceId));
}
