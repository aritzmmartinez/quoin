import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { z, ZodError } from "zod";

import { loadContract } from "../../../test/contract/load";
import {
  SYNC_CONTRACT_FILE,
  syncContractJson,
} from "../../../test/contract/sync-contract";

import { applyPlan, exportDevice, type LocalDevice } from "./apply";
import {
  holdingsBlockSchema,
  identityRowSchema,
  instrumentRowSchema,
  ledgerRowSchema,
  parseExchange,
  peerSchema,
  settingsRowSchema,
  syncStateSchema,
  targetRowSchema,
  tombstoneSchema,
  UnsupportedSchemaVersionError,
} from "./exchange";
import {
  changesData,
  conflictKey,
  merge,
  SameDeviceError,
  UnknownResolutionError,
  type Resolution,
} from "./merge";

const SETTINGS = { residence: "bizkaia", residenceHlc: null };

const expectedSchema = z.object({
  apply: z
    .object({
      ledger: z
        .object({
          insert: z.array(ledgerRowSchema).default([]),
          markInKind: z.array(z.string()).default([]),
        })
        .prefault({}),
      instruments: z
        .object({
          insert: z.array(instrumentRowSchema).default([]),
          update: z
            .array(
              z.object({
                id: z.string(),
                patch: z.record(z.string(), z.unknown()),
              }),
            )
            .default([]),
        })
        .prefault({}),
      targets: z
        .object({
          insert: z.array(targetRowSchema).default([]),
          delete: z.array(z.string()).default([]),
        })
        .prefault({}),
      tombstones: z.array(tombstoneSchema).default([]),
      holdings: z.array(holdingsBlockSchema).default([]),
      identities: z.array(identityRowSchema).default([]),
      settings: settingsRowSchema.partial().nullable().default(null),
      restamp: z.array(z.unknown()).default([]),
      peers: z.array(peerSchema).optional(),
    })
    .prefault({}),
  conflicts: z.array(z.unknown()).default([]),
  setAside: z.array(z.unknown()).default([]),
  error: z.literal("unknown-resolution").optional(),
  effects: z.array(z.unknown()).default([]),
  compareApply: z.boolean().default(false),
});

const resolutionsSchema = z
  .record(z.string(), z.enum(["keep", "take"]))
  .default({})
  .transform(
    (value) => new Map(Object.entries(value)) as Map<string, Resolution>,
  );

const contract = loadContract(
  "sync",
  z.object({
    contract: z.literal("sync"),
    version: z.literal(1),
    merges: z
      .array(
        z.object({
          name: z.string(),
          local: syncStateSchema.extend({
            settings: settingsRowSchema.default(SETTINGS),
          }),
          incoming: z.record(z.string(), z.unknown()),
          resolutions: resolutionsSchema,
          expected: expectedSchema,
        }),
      )
      .min(1),
    scenarios: z
      .array(
        z.object({
          name: z.string(),
          devices: z.record(
            z.string(),
            z.object({
              lastHlc: z.string().nullable(),
              state: syncStateSchema.extend({
                settings: settingsRowSchema.default(SETTINGS),
              }),
            }),
          ),
          steps: z.array(
            z.object({
              from: z.string(),
              to: z.string(),
              nowMs: z.number(),
              resolutions: resolutionsSchema,
              status: z.enum(["conflicts", "applied", "up-to-date"]),
              conflicts: z.array(z.string()).default([]),
              setAside: z.array(z.string()).default([]),
            }),
          ),
          converged: z.boolean(),
        }),
      )
      .min(1),
    refusals: z
      .array(
        z.object({
          name: z.string(),
          file: z.record(z.string(), z.unknown()),
          localDeviceId: z.string().optional(),
          error: z.enum([
            "unsupported-schema-version",
            "same-device",
            "invalid",
          ]),
        }),
      )
      .min(1),
  }),
);

const exchange = (file: Record<string, unknown>) =>
  parseExchange({
    schemaVersion: 1,
    deviceName: null,
    settings: SETTINGS,
    ...file,
  });

describe("sync contract", () => {
  describe.each(contract.merges)(
    "$name",
    ({ local, incoming, resolutions, expected }) => {
      if (expected.error) {
        it("refuses the resolutions", () => {
          expect(() => merge(local, exchange(incoming), resolutions)).toThrow(
            UnknownResolutionError,
          );
        });
        return;
      }
      const plan = merge(local, exchange(incoming), resolutions);

      it("raises exactly the conflicts on file", () => {
        expect(plan.conflicts).toEqual(expected.conflicts);
      });

      it("sets aside exactly the ledger rows on file", () => {
        expect(plan.setAside).toEqual(expected.setAside);
      });

      if (expected.conflicts.length === 0 || expected.compareApply) {
        it("applies exactly what is on file", () => {
          const { peers, ...apply } = expected.apply;
          const { peers: planned, ...rest } = plan.apply;
          expect(rest).toEqual(apply);
          if (peers) expect(planned).toEqual(peers);
        });
      }

      if (expected.conflicts.length === 0) {
        it("leaves exactly the effects on file", () => {
          expect(plan.effects).toEqual(expected.effects);
        });
      }
    },
  );

  describe.each(contract.scenarios)(
    "$name",
    ({ devices, steps, converged }) => {
      it("goes through every step as on file", () => {
        const held = new Map<string, LocalDevice>(Object.entries(devices));
        const get = (id: string) => {
          const found = held.get(id);
          if (!found) throw new Error(`No device ${id} in the scenario`);
          return found;
        };
        for (const [i, step] of steps.entries()) {
          const sent = exportDevice(get(step.from), step.nowMs);
          held.set(step.from, sent.device);
          const receiver = get(step.to);
          const plan = merge(receiver.state, sent.exchange, step.resolutions);
          const label = `step ${i + 1}`;
          expect(plan.conflicts.map(conflictKey), label).toEqual(
            step.conflicts,
          );
          expect(
            plan.setAside.map((row) => row.key),
            label,
          ).toEqual(step.setAside);
          if (plan.conflicts.length > 0) {
            expect("conflicts", label).toBe(step.status);
          } else if (!changesData(plan)) {
            expect("up-to-date", label).toBe(step.status);
            held.set(step.to, {
              ...receiver,
              state: { ...receiver.state, peers: plan.apply.peers },
            });
          } else {
            expect("applied", label).toBe(step.status);
            held.set(step.to, applyPlan(receiver, plan.apply, step.nowMs));
          }
        }
        const userState = ({ state }: LocalDevice) => {
          const { deviceId: _d, peers: _p, ...rest } = state;
          return rest;
        };
        const [first, second] = [...held.values()];
        if (!first || !second) throw new Error("A scenario needs two devices");
        if (converged) expect(userState(first)).toEqual(userState(second));
        else expect(userState(first)).not.toEqual(userState(second));
      });
    },
  );

  describe.each(contract.refusals)(
    "refuses: $name",
    ({ file, localDeviceId, error }) => {
      it(error, () => {
        const read = () => {
          const parsed = parseExchange(file);
          merge(
            {
              ...syncStateSchema.parse({
                deviceId: localDeviceId ?? "dev-a",
                settings: SETTINGS,
              }),
            },
            parsed,
          );
        };
        const type = {
          "unsupported-schema-version": UnsupportedSchemaVersionError,
          "same-device": SameDeviceError,
          invalid: ZodError,
        }[error];
        expect(read).toThrow(type);
      });
    },
  );
});

describe("sync contract source", () => {
  it("is what test/contract/sync-contract.ts writes", () => {
    expect(JSON.parse(readFileSync(SYNC_CONTRACT_FILE, "utf8"))).toEqual(
      JSON.parse(syncContractJson()),
    );
  });
});
