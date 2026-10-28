import {
  exchangeSchema,
  merge,
  parseExchange,
  SCHEMA_VERSION,
  type Effect,
  type Exchange,
  type MergePlan,
  type Peer,
  type SyncState,
} from "~/core/sync";

import { describeFailure } from "./describe-failure";
import { inTurn } from "./in-turn";
import { haltsSync } from "./prices-sync";

export interface SyncRepository {
  device(): Promise<{ deviceId: string; name: string | null }>;
  exportMark(): Promise<string>;
  state(): Promise<SyncState>;
  apply(
    plan: MergePlan["apply"],
    sender: { deviceId: string; name: string | null },
    now: Date,
  ): Promise<void>;
  savePeers(
    peers: readonly Peer[],
    sender: { deviceId: string; name: string | null },
    now: Date,
  ): Promise<void>;
}

export type EffectOutcome = { effect: Effect } & (
  | { ok: true }
  | { ok: false; reason: string }
);

export type RunEffect = (effect: Effect) => Promise<EffectOutcome>;

export async function exportState(
  repository: SyncRepository,
): Promise<Exchange> {
  const mark = await repository.exportMark();
  const [device, state] = await Promise.all([
    repository.device(),
    repository.state(),
  ]);
  return exchangeSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    deviceName: device.name,
    exportHlc: mark,
    ...state,
  });
}

export interface ImportDeps {
  repository: SyncRepository;
  runEffect: RunEffect;
  beforeApply?: () => Promise<void> | void;
  now: Date;
}

export type ImportResult = { plan: MergePlan; counts: PlanCounts } & (
  | { status: "conflicts" }
  | { status: "up-to-date" }
  | { status: "dry-run" }
  | { status: "applied"; effects: EffectOutcome[] }
);

export async function importState(
  deps: ImportDeps,
  raw: unknown,
  options: { dryRun: boolean },
): Promise<ImportResult> {
  const incoming = parseExchange(raw);
  const local = await deps.repository.state();
  const plan = merge(local, incoming);
  const counts = planCounts(plan, local);
  if (plan.conflicts.length > 0) return { status: "conflicts", plan, counts };

  const sender = { deviceId: incoming.deviceId, name: incoming.deviceName };
  if (!hasDataChanges(plan)) {
    if (!options.dryRun && !samePeers(local.peers, plan.apply.peers)) {
      await deps.repository.savePeers(plan.apply.peers, sender, deps.now);
    }
    return { status: "up-to-date", plan, counts };
  }
  if (options.dryRun) return { status: "dry-run", plan, counts };

  await deps.beforeApply?.();
  await deps.repository.apply(plan.apply, sender, deps.now);

  const effects = await inTurn(plan.effects, deps.runEffect, {
    onError: (error, effect): EffectOutcome => {
      if (haltsSync(error)) throw error;
      return { effect, ok: false, reason: describeFailure(error) };
    },
  });
  return { status: "applied", plan, counts, effects };
}

export interface PlanCounts {
  ledger: number;
  inKind: number;
  newInstruments: number;
  changedInstruments: number;
  newTargets: number;
  deletedTargets: number;
  newHoldings: number;
  replacedHoldings: number;
  newIdentities: number;
  updatedIdentities: number;
  settings: boolean;
}

export function planCounts({ apply }: MergePlan, local: SyncState): PlanCounts {
  const funds = new Set(local.holdings.map((b) => b.instrumentId));
  const known = new Set(local.identities.map((i) => i.identity));
  const newHoldings = apply.holdings.filter(
    (b) => !funds.has(b.instrumentId),
  ).length;
  const newIdentities = apply.identities.filter(
    (i) => !known.has(i.identity),
  ).length;
  return {
    ledger: apply.ledger.insert.length,
    inKind: apply.ledger.markInKind.length,
    newInstruments: apply.instruments.insert.length,
    changedInstruments: apply.instruments.update.length,
    newTargets: apply.targets.insert.length,
    deletedTargets: apply.targets.delete.length,
    newHoldings,
    replacedHoldings: apply.holdings.length - newHoldings,
    newIdentities,
    updatedIdentities: apply.identities.length - newIdentities,
    settings: apply.settings !== null,
  };
}

function hasDataChanges({ apply }: MergePlan): boolean {
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
    apply.settings !== null
  );
}

const samePeers = (a: readonly Peer[], b: readonly Peer[]) =>
  JSON.stringify(
    [...a].sort((x, y) => x.deviceId.localeCompare(y.deviceId)),
  ) === JSON.stringify(b);
