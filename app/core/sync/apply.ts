import { compareCodeUnits } from "../domain";

import {
  exchangeSchema,
  SCHEMA_VERSION,
  TARGET_ENTITY,
  type Exchange,
  type SyncState,
} from "./exchange";
import { tick } from "./hlc";
import { INSTRUMENT_FIELDS, type MergePlan } from "./merge";

export interface LocalDevice {
  state: SyncState;
  lastHlc: string | null;
}

export function exportDevice(
  device: LocalDevice,
  nowMs: number,
  deviceName: string | null = null,
): { exchange: Exchange; device: LocalDevice } {
  const exportHlc = tick(device.lastHlc, nowMs, device.state.deviceId);
  const exchange = exchangeSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    deviceName,
    exportHlc,
    ...device.state,
  });
  return { exchange, device: { ...device, lastHlc: exportHlc } };
}

const sortBy = <T>(rows: T[], key: (row: T) => string): T[] =>
  rows.sort((a, b) => compareCodeUnits(key(a), key(b)));

export function applyPlan(
  device: LocalDevice,
  plan: MergePlan["apply"],
  nowMs: number,
): LocalDevice {
  const { state } = device;
  let last = device.lastHlc;
  const fresh = () => (last = tick(last, nowMs, state.deviceId));

  const instruments = new Map(state.instruments.map((i) => [i.id, { ...i }]));
  for (const row of plan.instruments.insert) instruments.set(row.id, row);
  for (const { id, patch } of plan.instruments.update) {
    const row = instruments.get(id);
    if (row) instruments.set(id, { ...row, ...patch });
  }

  const inKind = new Set(plan.ledger.markInKind);
  const ledger = [
    ...state.ledger.map((row) =>
      inKind.has(`${row.source}::${row.externalId}`) && row.funding === "CASH"
        ? { ...row, funding: "IN_KIND" as const }
        : row,
    ),
    ...plan.ledger.insert,
  ];

  const deleted = new Set(plan.targets.delete);
  const targets = [
    ...state.targets.filter((t) => !deleted.has(t.id)),
    ...plan.targets.insert,
  ];
  const tombstones = [...state.tombstones, ...plan.tombstones];

  const holdings = new Map(state.holdings.map((b) => [b.instrumentId, b]));
  for (const block of plan.holdings) holdings.set(block.instrumentId, block);

  const identities = new Map(state.identities.map((i) => [i.identity, i]));
  for (const row of plan.identities) identities.set(row.identity, row);

  let settings = plan.settings
    ? { ...state.settings, ...plan.settings }
    : state.settings;

  for (const restamp of plan.restamp) {
    switch (restamp.kind) {
      case "instrument": {
        const row = instruments.get(restamp.id);
        if (row) {
          const mark = INSTRUMENT_FIELDS[restamp.field].mark;
          instruments.set(restamp.id, { ...row, [mark]: fresh() });
        }
        break;
      }
      case "settings":
        settings = { ...settings, residenceHlc: fresh() };
        break;
      case "holdings": {
        const block = holdings.get(restamp.instrumentId);
        if (block)
          holdings.set(restamp.instrumentId, { ...block, hlc: fresh() });
        break;
      }
      case "tombstone":
        tombstones.push({
          entity: TARGET_ENTITY,
          key: restamp.key,
          hlc: fresh(),
        });
        break;
      case "reissue": {
        const mark = fresh();
        tombstones.push({
          entity: TARGET_ENTITY,
          key: restamp.target.id,
          hlc: mark,
        });
        targets.push({ ...restamp.target, id: mark });
        break;
      }
    }
  }

  return {
    lastHlc: last,
    state: {
      deviceId: state.deviceId,
      peers: plan.peers,
      ledger: ledger.sort(
        (a, b) =>
          compareCodeUnits(a.source, b.source) ||
          compareCodeUnits(a.externalId, b.externalId),
      ),
      instruments: sortBy([...instruments.values()], (i) => i.id),
      targets: sortBy(targets, (t) => t.id),
      tombstones: sortBy(tombstones, (t) => `${t.entity}\u0000${t.key}`),
      holdings: sortBy([...holdings.values()], (b) => b.instrumentId),
      identities: sortBy([...identities.values()], (i) => i.identity),
      settings,
    },
  };
}
