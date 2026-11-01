import { describe, expect, it } from "vitest";

import {
  describeRow,
  discardGroups,
  discardTypeLabel,
  fileErrorMessage,
} from "./discards";
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

describe("a row-level warning", () => {
  it("warns for a group when any of its rows changes a position", () => {
    const dividend = { ...at("Test Bond"), affectsPosition: false };
    const trade = { ...at("Test Bond"), affectsPosition: true };
    const flag = (details: (typeof dividend)[]) =>
      discardGroups({
        discarded: { "unsupported-asset-class": details.length },
        discardedDetails: { "unsupported-asset-class": details },
      })[0]?.affectsPosition;

    expect(flag([dividend])).toBe(false);
    expect(flag([dividend, trade])).toBe(true);
  });
});

describe("describeRow", () => {
  it("names a row by its type, date and id, or by its position when it has no id", () => {
    const row = { date: "2025-01-04T10:00:00Z", type: "BUY" };
    expect(describeRow(en, { ...row, externalId: "t1", position: null })).toBe(
      "Buy · 2025-01-04T10:00:00Z · t1",
    );
    expect(describeRow(es, { ...row, externalId: null, position: 4 })).toBe(
      "Compra · 2025-01-04T10:00:00Z · fila 4",
    );
  });
});

describe("fileErrorMessage", () => {
  it("names the column, or the row and why it cannot be read", () => {
    expect(
      fileErrorMessage(en, {
        reason: "missing-column",
        column: "asset_class",
        row: null,
      }),
    ).toContain("asset_class");
    expect(
      fileErrorMessage(en, {
        reason: "invalid-number",
        column: null,
        row: {
          externalId: "D1",
          position: null,
          date: "2026-01-05 10:00:00",
          type: "deposit",
        },
      }),
    ).toContain("D1: Invalid number");
  });
});
