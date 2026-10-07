import { describe, expect, it } from "vitest";

import { discardGroups } from "./discards";

const at = (instrument: string | null) => ({
  date: "2026-02-01T09:00:00.000Z",
  type: "reward",
  subtype: null,
  instrument,
});

describe("discardGroups", () => {
  it("orders reasons with the ones that leave a position wrong first", () => {
    const groups = discardGroups({
      discarded: {
        unsupported: 1,
        "unmodelled-asset": 3,
        "crypto-transfer": 1,
        "card-spending": 4,
      },
      discardedDetails: {
        unsupported: [at("Test ETF")],
        "unmodelled-asset": [at("SOL"), at("ETH"), at("SOL")],
        "crypto-transfer": [at("BTC")],
      },
    });

    expect(groups.map((g) => [g.reason, g.count, g.affectsPosition])).toEqual([
      ["crypto-transfer", 1, true],
      ["unmodelled-asset", 3, false],
      ["card-spending", 4, false],
      ["unsupported", 1, false],
    ]);
  });

  it("counts each reason's groups by asset, most frequent first", () => {
    const [group] = discardGroups({
      discarded: { "unmodelled-asset": 4 },
      discardedDetails: {
        "unmodelled-asset": [at("SOL"), at("ETH"), at("SOL"), at(null)],
      },
    });

    expect(group?.byInstrument).toEqual([
      { instrument: "SOL", count: 2 },
      { instrument: null, count: 1 },
      { instrument: "ETH", count: 1 },
    ]);
  });

  it("keeps a reason that carries only a count, with no breakdown", () => {
    const [group] = discardGroups({
      discarded: { "card-spending": 7 },
      discardedDetails: {},
    });

    expect(group).toMatchObject({
      reason: "card-spending",
      count: 7,
      details: [],
      byInstrument: [],
    });
  });

  it("is empty when nothing was set aside", () => {
    expect(discardGroups({ discarded: {}, discardedDetails: {} })).toEqual([]);
  });
});
