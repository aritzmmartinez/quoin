import { describe, expect, it, vi } from "vitest";

import { MarketDataUnavailableError } from "~/core/ports";
import { formatHlc, syncStateSchema } from "~/core/sync";

import { exportState, importState, type SyncRepository } from "./sync";

const T = Date.UTC(2026, 9, 28, 10);
const markOf = (deviceId: string, ms: number) =>
  formatHlc({ ms, counter: 0, deviceId });
const SETTINGS = { residence: "bizkaia", residenceHlc: null };

function fakeRepository(state: Record<string, unknown> & { deviceId: string }) {
  const applied: unknown[] = [];
  const peersSaved: unknown[] = [];
  const repository: SyncRepository = {
    device: async () => ({ deviceId: state.deviceId, name: null }),
    exportMark: async () => markOf(state.deviceId, T),
    state: async () => syncStateSchema.parse({ settings: SETTINGS, ...state }),
    apply: async (plan) => {
      applied.push(plan);
    },
    savePeers: async (peers) => {
      peersSaved.push(peers);
    },
  };
  return { repository, applied, peersSaved };
}

const fund = { id: "IE00TEST0001", name: "Test Fund", type: "ETF" };
const file = (extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  deviceId: "dev-b",
  deviceName: "phone",
  exportHlc: markOf("dev-b", T),
  settings: SETTINGS,
  ...extra,
});
const symbolChange = file({
  instruments: [
    { ...fund, quoteSymbol: "TEST.DE", quoteSymbolHlc: markOf("dev-b", T - 1) },
  ],
});

describe("exportState", () => {
  it("writes a file the import side can read, marked after everything it holds", async () => {
    const { repository } = fakeRepository({
      deviceId: "dev-a",
      instruments: [fund],
    });
    const exchange = await exportState(repository);
    expect(exchange).toMatchObject({
      schemaVersion: 1,
      deviceId: "dev-a",
      exportHlc: markOf("dev-a", T),
      instruments: [expect.objectContaining({ id: fund.id })],
    });
  });
});

describe("importState", () => {
  const ok = vi.fn(async (effect) => ({ effect, ok: true as const }));

  it("writes nothing on a dry run, and still says what it would do", async () => {
    const { repository, applied } = fakeRepository({ deviceId: "dev-a" });
    const beforeApply = vi.fn();
    const result = await importState(
      { repository, runEffect: ok, beforeApply, now: new Date(T) },
      symbolChange,
      { dryRun: true },
    );
    expect(result.status).toBe("dry-run");
    expect(result.plan.effects).toEqual([
      { kind: "prices", instrumentId: fund.id, symbol: "TEST.DE" },
    ]);
    expect(applied).toEqual([]);
    expect(beforeApply).not.toHaveBeenCalled();
  });

  it("writes nothing while there is a conflict", async () => {
    const { repository, applied } = fakeRepository({
      deviceId: "dev-a",
      instruments: [{ ...fund, ter: "0.0022" }],
    });
    const result = await importState(
      { repository, runEffect: ok, now: new Date(T) },
      file({ instruments: [{ ...fund, ter: "0.0030" }] }),
      { dryRun: false },
    );
    expect(result.status).toBe("conflicts");
    expect(applied).toEqual([]);
  });

  it("backs up first, and imports nothing when the backup fails", async () => {
    const { repository, applied } = fakeRepository({ deviceId: "dev-a" });
    await expect(
      importState(
        {
          repository,
          runEffect: ok,
          beforeApply: () => {
            throw new Error("disk full");
          },
          now: new Date(T),
        },
        symbolChange,
        { dryRun: false },
      ),
    ).rejects.toThrow("disk full");
    expect(applied).toEqual([]);
  });

  it("keeps the data applied when an effect fails at the provider, and reports it", async () => {
    const { repository, applied } = fakeRepository({ deviceId: "dev-a" });
    const result = await importState(
      {
        repository,
        runEffect: async () => {
          throw new MarketDataUnavailableError("TEST.DE", 429);
        },
        now: new Date(T),
      },
      symbolChange,
      { dryRun: false },
    );
    expect(applied).toHaveLength(1);
    expect(result).toMatchObject({
      status: "applied",
      effects: [
        { ok: false, effect: { kind: "prices", instrumentId: fund.id } },
      ],
    });
  });

  it("backs nothing up and writes no data when the file brings none, keeping only what the sender has seen", async () => {
    const { repository, applied, peersSaved } = fakeRepository({
      deviceId: "dev-a",
    });
    const beforeApply = vi.fn();
    const result = await importState(
      { repository, runEffect: ok, beforeApply, now: new Date(T) },
      file(),
      { dryRun: false },
    );
    expect(result.status).toBe("up-to-date");
    expect(beforeApply).not.toHaveBeenCalled();
    expect(applied).toEqual([]);
    expect(peersSaved).toEqual([
      [{ deviceId: "dev-b", seen: markOf("dev-b", T) }],
    ]);
  });

  it("writes nothing at all when the file brings no data and nothing new was seen", async () => {
    const { repository, applied, peersSaved } = fakeRepository({
      deviceId: "dev-a",
      peers: [{ deviceId: "dev-b", seen: markOf("dev-b", T) }],
    });
    const result = await importState(
      { repository, runEffect: ok, now: new Date(T) },
      file(),
      { dryRun: false },
    );
    expect(result.status).toBe("up-to-date");
    expect(applied).toEqual([]);
    expect(peersSaved).toEqual([]);
  });

  it("tells what is new from what replaces or updates a stored row", async () => {
    const block = (instrumentId: string) => ({
      instrumentId,
      asOf: "2026-09-30",
      asOfInferred: false,
      hlc: markOf("dev-b", T - 1),
      rows: [
        {
          identity: "US00TEST0101",
          identityKind: "ISIN",
          name: "Alpha",
          weight: "1",
        },
      ],
    });
    const identity = (value: string, status: string) => ({
      identity: value,
      identityKind: "ISIN",
      canonicalId: status === "resolved" ? "TESTFIGI0001" : null,
      status,
      source: "openfigi",
      resolvedAt: "2026-10-01T10:00:00.000Z",
    });
    const other = { ...fund, id: "IE00TEST0002" };
    const { repository } = fakeRepository({
      deviceId: "dev-a",
      instruments: [fund],
      holdings: [{ ...block(fund.id), hlc: null, asOfInferred: true }],
      identities: [identity("US00TEST0101", "not-found")],
    });
    const result = await importState(
      { repository, runEffect: ok, now: new Date(T) },
      file({
        instruments: [fund, other],
        holdings: [block(fund.id), block(other.id)],
        identities: [
          identity("US00TEST0101", "resolved"),
          identity("US00TEST0102", "resolved"),
        ],
      }),
      { dryRun: true },
    );
    expect(result.counts).toMatchObject({
      newHoldings: 1,
      replacedHoldings: 1,
      newIdentities: 1,
      updatedIdentities: 1,
    });
  });

  it("stops on a failure that is not the provider's", async () => {
    const { repository } = fakeRepository({ deviceId: "dev-a" });
    await expect(
      importState(
        {
          repository,
          runEffect: async () => {
            throw new Error("database is locked");
          },
          now: new Date(T),
        },
        symbolChange,
        { dryRun: false },
      ),
    ).rejects.toThrow("database is locked");
  });
});
