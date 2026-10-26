import { describe, expect, it } from "vitest";

import { discardGroups, discardTypeLabel } from "./discards";
import { en } from "./i18n/en";
import { es } from "./i18n/es";

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
        "internal-move": 3,
        "crypto-transfer": 1,
        "card-spending": 4,
      },
      discardedDetails: {
        unsupported: [at("Test ETF")],
        "internal-move": [at("SOL"), at("ETH"), at("SOL")],
        "crypto-transfer": [at("BTC")],
      },
    });

    expect(groups.map((g) => [g.reason, g.count, g.affectsPosition])).toEqual([
      ["crypto-transfer", 1, true],
      ["internal-move", 3, false],
      ["card-spending", 4, false],
      ["unsupported", 1, false],
    ]);
  });

  it("counts each reason's groups by asset, most frequent first", () => {
    const [group] = discardGroups({
      discarded: { "internal-move": 4 },
      discardedDetails: {
        "internal-move": [at("SOL"), at("ETH"), at("SOL"), at(null)],
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

describe("discardTypeLabel", () => {
  it.each([
    [es, "BUY", "Compra"],
    [es, "DEPOSIT", "Ingreso"],
    [en, "BUY", "Buy"],
    [en, "DIVIDEND", "Dividend"],
  ])("labels a ledger type as Movements does", (copy, type, label) => {
    expect(discardTypeLabel(copy, type)).toBe(label);
  });

  it.each(["receive", "staking", "BENEFITS_SAVEBACK", "toString"])(
    "keeps a broker's own type %s as it came",
    (type) => {
      expect(discardTypeLabel(es, type)).toBe(type);
    },
  );
});
