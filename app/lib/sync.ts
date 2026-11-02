import type {
  SyncSender,
  SyncStore,
} from "~/adapters/persistence/sync-repository";
import {
  changesData,
  exportDevice,
  merge,
  parseExchange,
  type Effect,
  type Exchange,
  type MergePlan,
  type Peer,
  type Resolutions,
  type SyncState,
} from "~/core/sync";

import { describeFailure } from "./describe-failure";
import { inTurn } from "./in-turn";
import { haltsSync } from "./prices-sync";

export type { SyncStore, SyncTx } from "~/adapters/persistence/sync-repository";

export type EffectOutcome = { effect: Effect } & (
  | { ok: true }
  | { ok: false; reason: string }
);

export type RunEffect = (effect: Effect) => Promise<EffectOutcome>;

export function exportState(store: SyncStore, now: Date): Promise<Exchange> {
  return store.transaction((tx) => {
    const { device, name } = tx.read();
    const exported = exportDevice(device, now.getTime(), name);
    if (exported.device.lastHlc) tx.setLastHlc(exported.device.lastHlc);
    return exported.exchange;
  });
}

export interface ImportDeps {
  store: SyncStore;
  runEffect: RunEffect;
  beforeApply?: () => void;
  now: Date;
}

export interface ImportOptions {
  dryRun: boolean;
  resolutions?: Resolutions;
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
  options: ImportOptions,
): Promise<ImportResult> {
  const incoming = parseExchange(raw);
  const sender: SyncSender = {
    deviceId: incoming.deviceId,
    name: incoming.deviceName,
  };
  const nowMs = deps.now.getTime();

  const result = await deps.store.transaction((tx) => {
    const { state } = tx.read().device;
    const plan = merge(state, incoming, options.resolutions);
    const counts = planCounts(plan, state);
    if (plan.conflicts.length > 0) {
      return { status: "conflicts" as const, plan, counts };
    }
    if (!changesData(plan)) {
      if (!options.dryRun && !samePeers(state.peers, plan.apply.peers)) {
        tx.savePeers(plan.apply.peers, sender, nowMs);
      }
      return { status: "up-to-date" as const, plan, counts };
    }
    if (options.dryRun) return { status: "dry-run" as const, plan, counts };

    deps.beforeApply?.();
    tx.apply(plan.apply, sender, nowMs);
    return { status: "applied" as const, plan, counts };
  });
  if (result.status !== "applied") return result;

  const effects = await inTurn(result.plan.effects, deps.runEffect, {
    onError: (error, effect): EffectOutcome => {
      if (haltsSync(error)) throw error;
      return { effect, ok: false, reason: describeFailure(error) };
    },
  });
  return { ...result, effects };
}

export interface PlanCounts {
  ledger: number;
  inKind: number;
  setAside: number;
  newInstruments: number;
  changedInstruments: number;
  newTargets: number;
  deletedTargets: number;
  newHoldings: number;
  replacedHoldings: number;
  newIdentities: number;
  updatedIdentities: number;
  settings: boolean;
  restamped: number;
}

export function planCounts(plan: MergePlan, local: SyncState): PlanCounts {
  const { apply } = plan;
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
    setAside: plan.setAside.length,
    newInstruments: apply.instruments.insert.length,
    changedInstruments: apply.instruments.update.length,
    newTargets: apply.targets.insert.length,
    deletedTargets: apply.targets.delete.length,
    newHoldings,
    replacedHoldings: apply.holdings.length - newHoldings,
    newIdentities,
    updatedIdentities: apply.identities.length - newIdentities,
    settings: apply.settings !== null,
    restamped: apply.restamp.length,
  };
}

const samePeers = (a: readonly Peer[], b: readonly Peer[]) =>
  JSON.stringify(
    [...a].sort((x, y) => x.deviceId.localeCompare(y.deviceId)),
  ) === JSON.stringify(b);
