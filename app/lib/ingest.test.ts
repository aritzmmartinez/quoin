import { describe, expect, it } from "vitest";

import type { ImportSummary } from "~/adapters/ingestion";

import {
  earliestUnpricedReward,
  importAction,
  mergeRewardRetry,
  rewardRetryIds,
  retryAfterFill,
  rewardsNeedMapping,
  unpricedRewards,
} from "./ingest";

const reward = (date: string) => ({
  date,
  type: "reward",
  subtype: null,
  instrument: "BTC",
});

const summary = (over: Partial<ImportSummary> = {}): ImportSummary => ({
  total: 6,
  imported: 2,
  duplicates: 0,
  discarded: {},
  discardedDetails: {},
  errors: 0,
  instruments: 1,
  ...over,
});

const first = summary({
  discarded: { "reward-unpriced": 3, "unmodelled-asset": 1 },
  discardedDetails: {
    "reward-unpriced": [
      reward("2026-03-08T05:52:00.000Z"),
      reward("2026-03-01T05:52:00.000Z"),
      reward("2026-03-15T05:52:00.000Z"),
    ],
    "unmodelled-asset": [
      { date: "2026-01-11T05:52:10.000Z", type: "earn", subtype: "reward", instrument: "SOL" },
    ],
  },
});

describe("reward retry helpers", () => {
  it("reads how many rewards were set aside for want of a price", () => {
    expect(unpricedRewards(first)).toBe(3);
    expect(unpricedRewards(summary())).toBe(0);
  });

  it("names the instruments to price, once each", () => {
    expect(rewardRetryIds(first)).toEqual(["BTC"]);
    expect(rewardRetryIds(summary())).toEqual([]);
  });

  it("finds the oldest unpriced reward, which decides the range to fetch", () => {
    expect(earliestUnpricedReward(first)).toEqual(
      new Date("2026-03-01T05:52:00.000Z"),
    );
    expect(earliestUnpricedReward(summary())).toBeNull();
  });
});

describe("mergeRewardRetry", () => {
  it("counts every reward the retry valued and drops the reason when none is left", () => {
    const retry = summary({
      imported: 6,
      duplicates: 2,
      discarded: { "unmodelled-asset": 1 },
      discardedDetails: { "unmodelled-asset": first.discardedDetails["unmodelled-asset"] },
    });

    const merged = mergeRewardRetry(first, retry);

    expect(merged.recovered).toBe(3);
    expect(merged.summary.imported).toBe(8);
    expect(merged.summary.duplicates).toBe(0);
    expect(merged.summary.discarded).toEqual({ "unmodelled-asset": 1 });
    expect(merged.summary.discardedDetails["reward-unpriced"]).toBeUndefined();
  });

  it("keeps the rewards the prices still did not reach, with their rows", () => {
    const left = [reward("2026-03-01T05:52:00.000Z")];
    const retry = summary({
      imported: 4,
      discarded: { "reward-unpriced": 1, "unmodelled-asset": 1 },
      discardedDetails: { "reward-unpriced": left },
    });

    const merged = mergeRewardRetry(first, retry);

    expect(merged.recovered).toBe(2);
    expect(merged.summary.discarded["reward-unpriced"]).toBe(1);
    expect(merged.summary.discardedDetails["reward-unpriced"]).toEqual(left);
    expect(merged.summary.discarded["unmodelled-asset"]).toBe(1);
  });
});

describe("retryAfterFill", () => {
  const report = (instrumentId: string, written: number) => ({
    instrumentId,
    symbol: `${instrumentId}-EUR`,
    written,
    first: null,
    last: null,
    currency: "EUR",
    foreignCurrency: null,
    weekly: false,
  });
  const fill = (backfilled: ReturnType<typeof report>[]) => ({
    backfilled,
    candles: backfilled.reduce((sum, r) => sum + r.written, 0),
    synced: 0,
    stale: 0,
    noQuote: 0,
    notEur: 0,
  });

  it("retries only once the reward's instrument got candles", () => {
    expect(retryAfterFill(first, fill([report("BTC", 365)]))).toBe(true);
  });

  it("does not retry when the price step wrote nothing for it", () => {
    expect(retryAfterFill(first, fill([]))).toBe(false);
    expect(retryAfterFill(first, fill([report("BTC", 0)]))).toBe(false);
    expect(retryAfterFill(first, fill([report("IE00TEST0001", 90)]))).toBe(false);
    expect(retryAfterFill(first, null)).toBe(false);
  });

  it("does not retry when no reward was waiting", () => {
    expect(retryAfterFill(summary(), fill([report("BTC", 365)]))).toBe(false);
  });
});

describe("rewardsNeedMapping", () => {
  const btc = { instrumentId: "BTC", name: "Bitcoin", quantity: "0" };

  it("points at the mapping step while BTC is pending and unmapped", () => {
    expect(rewardsNeedMapping(first, [btc], {})).toBe(true);
  });

  it("stops once BTC is mapped, or was never pending", () => {
    expect(rewardsNeedMapping(first, [btc], { BTC: "BTC-EUR" })).toBe(false);
    expect(rewardsNeedMapping(first, [], {})).toBe(false);
    expect(rewardsNeedMapping(summary(), [btc], {})).toBe(false);
  });
});

describe("mergeRewardRetry keeps every other reason's rows", () => {
  it("still lists an unsupported row in the final summary", () => {
    const transfer = {
      date: "2025-11-20T10:00:00.000Z",
      type: "transfer",
      subtype: "useraccounttransfer",
      instrument: "EUR",
    };
    const withUnsupported = summary({
      discarded: { "reward-unpriced": 1, unsupported: 1 },
      discardedDetails: {
        "reward-unpriced": [reward("2026-03-01T05:52:00.000Z")],
        unsupported: [transfer],
      },
    });
    const retry = summary({
      imported: 1,
      discarded: { unsupported: 1 },
      discardedDetails: { unsupported: [transfer] },
    });

    const merged = mergeRewardRetry(withUnsupported, retry).summary;

    expect(merged.discarded).toEqual({ unsupported: 1 });
    expect(merged.discardedDetails).toEqual({ unsupported: [transfer] });
  });
});

describe("importAction", () => {
  it("imports when something new is in the file, whatever else is pending", () => {
    expect(importAction(summary({ imported: 2 }))).toBe("import");
    expect(importAction({ ...first, imported: 2 })).toBe("import");
  });

  it("offers to value the rewards when nothing is new but some still lack a price", () => {
    expect(
      importAction({ ...first, imported: 0, duplicates: 8 }),
    ).toBe("value-rewards");
  });

  it("has nothing to do when nothing is new and no reward is pending", () => {
    expect(
      importAction(
        summary({ imported: 0, duplicates: 13, discarded: { unsupported: 1 } }),
      ),
    ).toBe("nothing");
  });
});
