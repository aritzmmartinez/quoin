import { describe, expect, it } from "vitest";
import { z, ZodError } from "zod";

import { loadContract } from "../../../test/contract/load";

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
import { merge, SameDeviceError } from "./merge";

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
      peers: z.array(peerSchema).optional(),
    })
    .prefault({}),
  conflicts: z.array(z.unknown()).default([]),
  effects: z.array(z.unknown()).default([]),
  compareApply: z.boolean().default(false),
});

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
          expected: expectedSchema,
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
  describe.each(contract.merges)("$name", ({ local, incoming, expected }) => {
    const plan = merge(local, exchange(incoming));

    it("raises exactly the conflicts on file", () => {
      expect(plan.conflicts).toEqual(expected.conflicts);
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
  });

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
