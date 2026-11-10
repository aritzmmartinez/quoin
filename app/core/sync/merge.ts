import { compareCodeUnits } from "../domain";

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

export const INSTRUMENT_FIELDS = {
  quoteSymbol: { mark: "quoteSymbolHlc", values: ["quoteSymbol"] },
  exposure: { mark: "exposureHlc", values: ["exposureKind", "exposureLeafId"] },
  ter: { mark: "terHlc", values: ["ter"] },
  hedgedToBase: { mark: "hedgedToBaseHlc", values: ["hedgedToBase"] },
  thesis: { mark: "thesisHlc", values: ["thesis"] },
} as const satisfies Record<
  string,
  { mark: keyof InstrumentRow; values: readonly (keyof InstrumentRow)[] }
>;
export type InstrumentField = keyof typeof INSTRUMENT_FIELDS;

export type Conflict =
  | {
      kind: "field";
      entity: "instrument" | "settings";
      key: string;
      field: string;
      local: unknown;
      incoming: unknown;
    }
  | { kind: "target"; id: string }
  | { kind: "target-day"; day: string; local: string; incoming: string }
  | { kind: "holdings"; instrumentId: string };

export interface LedgerConflict {
  kind: "ledger";
  key: string;
  fields: string[];
}

export type Resolution = "keep" | "take";
export type Resolutions = ReadonlyMap<string, Resolution>;

/**
 * What the applying side marks with fresh marks of its own, in this order.
 * `keep` is a claim that the local value is the newer one, so the next exchange
 * carries it across; the value itself does not change.
 */
export type Restamp =
  | { kind: "instrument"; id: string; field: InstrumentField }
  | { kind: "settings" }
  | { kind: "holdings"; instrumentId: string }
  | { kind: "tombstone"; key: string }
  | { kind: "reissue"; target: TargetRow };

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
    restamp: Restamp[];
    peers: Peer[];
  };
  conflicts: Conflict[];
  setAside: LedgerConflict[];
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

export class UnknownResolutionError extends Error {
  constructor(readonly keys: string[]) {
    super(`No conflict matches the resolution of ${keys.join(", ")}`);
    this.name = "UnknownResolutionError";
  }
}

export function conflictKey(conflict: Conflict): string {
  switch (conflict.kind) {
    case "field":
      return conflict.entity === "settings"
        ? `settings:${conflict.field}`
        : `instrument:${conflict.key}:${conflict.field}`;
    case "target":
      return `target:${conflict.id}`;
    case "target-day":
      return `target-day:${conflict.day}`;
    case "holdings":
      return `holdings:${conflict.instrumentId}`;
  }
}

export function restampKey(restamp: Restamp): string {
  switch (restamp.kind) {
    case "instrument":
      return `instrument:${restamp.id}:${restamp.field}`;
    case "settings":
      return "settings";
    case "holdings":
      return `holdings:${restamp.instrumentId}`;
    case "tombstone":
      return `tombstone:${restamp.key}`;
    case "reissue":
      return `reissue:${restamp.target.id}`;
  }
}

export function changesData({ apply }: MergePlan): boolean {
  return (
    apply.ledger.insert.length > 0 ||
    apply.ledger.markInKind.length > 0 ||
    apply.instruments.insert.length > 0 ||
    apply.instruments.update.length > 0 ||
    apply.targets.insert.length > 0 ||
    apply.targets.delete.length > 0 ||
    apply.tombstones.length > 0 ||
    apply.holdings.length > 0 ||
    apply.identities.length > 0 ||
    apply.settings !== null ||
    apply.restamp.length > 0
  );
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

/** A conflict the caller resolved, or `null` after recording it as open. */
class Conflicts {
  readonly open: Conflict[] = [];
  private readonly used = new Set<string>();

  constructor(private readonly resolutions: Resolutions) {}

  resolve(conflict: Conflict): Resolution | null {
    const key = conflictKey(conflict);
    const resolution = this.resolutions.get(key);
    if (resolution === undefined) {
      this.open.push(conflict);
      return null;
    }
    this.used.add(key);
    return resolution;
  }

  assertAllUsed(): void {
    const unused = [...this.resolutions.keys()]
      .filter((key) => !this.used.has(key))
      .sort(compareCodeUnits);
    if (unused.length > 0) throw new UnknownResolutionError(unused);
  }
}

const effectKey = (effect: Effect) =>
  effect.kind === "prices"
    ? `prices:${effect.instrumentId}`
    : `rates:${effect.currency}`;
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const byKey = <T>(rows: readonly T[], key: (row: T) => string) =>
  new Map(rows.map((row) => [key(row), row] as const));

export function merge(
  local: SyncState,
  incoming: Exchange,
  resolutions: Resolutions = new Map(),
): MergePlan {
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

  const conflicts = new Conflicts(resolutions);
  const restamp: Restamp[] = [];
  const effects: Effect[] = [];

  const { ledger, setAside } = mergeLedger(
    local.ledger,
    incoming.ledger,
    effects,
  );
  const instruments = mergeInstruments(
    local.instruments,
    incoming.instruments,
    me,
    them,
    conflicts,
    restamp,
    effects,
  );
  const { targets, tombstones } = mergeTargets(
    local,
    incoming,
    conflicts,
    restamp,
  );
  const holdings = mergeHoldings(
    local.holdings,
    incoming.holdings,
    me,
    them,
    conflicts,
    restamp,
  );
  const identities = mergeIdentities(local.identities, incoming.identities);

  let settings: Partial<SettingsRow> | null = null;
  if (local.settings.residence !== incoming.settings.residence) {
    let decision = decide(
      me,
      them,
      local.settings.residenceHlc,
      incoming.settings.residenceHlc,
    );
    if (decision === "conflict") {
      decision =
        conflicts.resolve({
          kind: "field",
          entity: "settings",
          key: "settings",
          field: "residence",
          local: local.settings.residence,
          incoming: incoming.settings.residence,
        }) ?? "conflict";
      if (decision === "keep") restamp.push({ kind: "settings" });
    }
    if (decision === "take") settings = incoming.settings;
  }

  conflicts.assertAllUsed();

  return {
    apply: {
      ledger,
      instruments,
      targets,
      tombstones,
      holdings,
      identities,
      settings,
      restamp: restamp.sort((a, b) =>
        compareCodeUnits(restampKey(a), restampKey(b)),
      ),
      peers: mergeSeen(me, them, incoming.exportHlc),
    },
    conflicts: conflicts.open,
    setAside,
    effects: effects.sort((a, b) =>
      compareCodeUnits(effectKey(a), effectKey(b)),
    ),
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

/**
 * A ledger row has no mark, so a difference cannot be resolved by a newer
 * change: the row is set aside, each side keeps its own version, and the rest
 * applies. Leaving it out loses nothing — a conflict needs the row on both
 * sides — and `seen` may still advance, because no mark covers the ledger.
 * A linked operation is set aside whole, by the link on either side.
 *
 * A Kraken reward is two unlinked rows (`refid` and `refid:income`) carrying one
 * value: a revaluation differs in both, and both are already stored, so both
 * are set aside without a link to join them.
 */
function mergeLedger(
  local: readonly LedgerRow[],
  incoming: readonly LedgerRow[],
  effects: Effect[],
): { ledger: MergePlan["apply"]["ledger"]; setAside: LedgerConflict[] } {
  const stored = byKey(local, ledgerKey);
  const insert: LedgerRow[] = [];
  const markInKind: string[] = [];
  const setAside: LedgerConflict[] = [];
  const blockedLinks = new Set<string>();

  for (const row of incoming) {
    const key = ledgerKey(row);
    const mine = stored.get(key);
    if (!mine) continue;
    const fields: string[] = LEDGER_COMPARED.filter((f) => mine[f] !== row[f]);
    if (Date.parse(mine.ts) !== Date.parse(row.ts)) fields.unshift("ts");
    if (fields.length > 0) {
      setAside.push({ kind: "ledger", key, fields });
      for (const side of [row, mine]) {
        if (side.linkId != null)
          blockedLinks.add(`${side.source}::${side.linkId}`);
      }
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
    ledger: {
      insert: insert.sort((a, b) =>
        compareCodeUnits(ledgerKey(a), ledgerKey(b)),
      ),
      markInKind: markInKind.sort(compareCodeUnits),
    },
    setAside: setAside.sort((a, b) => compareCodeUnits(a.key, b.key)),
  };
}

function mergeInstruments(
  local: readonly InstrumentRow[],
  incoming: readonly InstrumentRow[],
  me: Side,
  them: Side,
  conflicts: Conflicts,
  restamp: Restamp[],
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
    for (const [name, { mark, values }] of Object.entries(INSTRUMENT_FIELDS)) {
      const field = name as InstrumentField;
      if (values.every((v) => mine[v] === row[v])) continue;
      let decision = decide(me, them, mine[mark], row[mark]);
      if (decision === "conflict") {
        decision =
          conflicts.resolve({
            kind: "field",
            entity: "instrument",
            key: row.id,
            field,
            local:
              values.length === 1
                ? mine[values[0]!]
                : values.map((v) => mine[v]),
            incoming:
              values.length === 1 ? row[values[0]!] : values.map((v) => row[v]),
          }) ?? "conflict";
        if (decision === "keep")
          restamp.push({ kind: "instrument", id: row.id, field });
      }
      if (decision === "take") {
        for (const v of values) patch[v] = row[v];
        patch[mark] = row[mark];
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
    insert: insert.sort((a, b) => compareCodeUnits(a.id, b.id)),
    update: update.sort((a, b) => compareCodeUnits(a.id, b.id)),
  };
}

/**
 * Plan versions carry no mark and are never edited, so a resolution travels as
 * a tombstone, which does. Two versions on one day: the losing one is
 * tombstoned. One id with two contents: `take` replaces the local one and both
 * sides then agree; `keep` cannot win with the same id, so the local content is
 * reissued under a new id (the mark of the tombstone that buries the old one).
 */
function mergeTargets(
  local: SyncState,
  incoming: Exchange,
  conflicts: Conflicts,
  restamp: Restamp[],
): { targets: MergePlan["apply"]["targets"]; tombstones: Tombstone[] } {
  const buried = new Set(local.tombstones.map((t) => t.key));
  const tombstones = incoming.tombstones
    .filter((t) => !buried.has(t.key))
    .sort((a, b) => compareCodeUnits(a.key, b.key));
  const dead = new Set([...buried, ...tombstones.map((t) => t.key)]);

  const stored = byKey(local.targets, (t) => t.id);
  const insert: TargetRow[] = [];
  const remove = new Set(
    local.targets.filter((t) => dead.has(t.id)).map((t) => t.id),
  );
  const replaced = new Set<string>();
  for (const target of incoming.targets) {
    if (dead.has(target.id)) continue;
    const mine = stored.get(target.id);
    if (!mine) {
      insert.push(target);
      continue;
    }
    if (same(mine, target)) continue;
    const resolution = conflicts.resolve({ kind: "target", id: target.id });
    if (resolution === null) continue;
    remove.add(target.id);
    if (resolution === "take") {
      replaced.add(target.id);
      insert.push(target);
    } else {
      restamp.push({ kind: "reissue", target: mine });
    }
  }

  const localByDay = new Map(
    local.targets
      .filter((t) => !dead.has(t.id) && !replaced.has(t.id))
      .map((t) => [t.activeFrom, t.id] as const),
  );
  for (const target of [...insert].sort((a, b) =>
    compareCodeUnits(a.activeFrom, b.activeFrom),
  )) {
    const mine = localByDay.get(target.activeFrom);
    if (mine === undefined || mine === target.id) continue;
    const resolution = conflicts.resolve({
      kind: "target-day",
      day: target.activeFrom,
      local: mine,
      incoming: target.id,
    });
    if (resolution === "take") {
      remove.add(mine);
      restamp.push({ kind: "tombstone", key: mine });
    } else if (resolution === "keep") {
      insert.splice(insert.indexOf(target), 1);
      restamp.push({ kind: "tombstone", key: target.id });
    }
  }

  return {
    targets: {
      insert: insert.sort((a, b) => compareCodeUnits(a.id, b.id)),
      delete: [...remove].sort(compareCodeUnits),
    },
    tombstones,
  };
}

function mergeHoldings(
  local: readonly HoldingsBlockRow[],
  incoming: readonly HoldingsBlockRow[],
  me: Side,
  them: Side,
  conflicts: Conflicts,
  restamp: Restamp[],
): HoldingsBlockRow[] {
  const stored = byKey(local, (b) => b.instrumentId);
  const replace: HoldingsBlockRow[] = [];
  const sortedRows = (b: HoldingsBlockRow) =>
    [...b.rows].sort((x, y) => compareCodeUnits(x.identity, y.identity));

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
      const resolution = conflicts.resolve({
        kind: "holdings",
        instrumentId: block.instrumentId,
      });
      if (resolution === "take") replace.push(block);
      if (resolution === "keep")
        restamp.push({ kind: "holdings", instrumentId: block.instrumentId });
    }
  }
  return replace.sort((a, b) =>
    compareCodeUnits(a.instrumentId, b.instrumentId),
  );
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
    .sort((a, b) => compareCodeUnits(a.identity, b.identity));
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
    .sort((a, b) => compareCodeUnits(a.deviceId, b.deviceId));
}
