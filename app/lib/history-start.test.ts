import { describe, expect, it } from "vitest";

import type { LedgerEvent } from "~/core/domain";

import { firstEventByInstrument, firstTradeAt } from "./history-start";

const base = {
  currency: "EUR",
  fxToBase: "1",
  account: "test",
  source: "TEST",
  externalId: null,
  note: null,
};

const trade = (
  id: string,
  type: "BUY" | "SELL",
  instrumentId: string,
  ts: string,
): LedgerEvent => ({
  ...base,
  id,
  type,
  ts: new Date(ts),
  instrumentId,
  quantity: "1",
  price: "10",
  grossAmount: "10",
  fees: "0",
});

const dividend = (
  id: string,
  instrumentId: string,
  ts: string,
): LedgerEvent => ({
  ...base,
  id,
  type: "DIVIDEND",
  ts: new Date(ts),
  instrumentId,
  grossAmount: "1",
  taxWithheld: "0",
});

const deposit = (id: string, ts: string): LedgerEvent => ({
  ...base,
  id,
  type: "DEPOSIT",
  ts: new Date(ts),
  grossAmount: "100",
});

describe("firstEventByInstrument", () => {
  it("keeps each instrument's earliest event, whatever the input order", () => {
    const first = firstEventByInstrument([
      trade("1", "BUY", "XS00TEST0001", "2026-03-01T10:00:00Z"),
      trade("2", "BUY", "XS00TEST0002", "2026-02-01T10:00:00Z"),
      trade("3", "SELL", "XS00TEST0001", "2026-01-15T10:00:00Z"),
    ]);
    expect(first).toEqual(
      new Map([
        ["XS00TEST0001", new Date("2026-01-15T10:00:00Z")],
        ["XS00TEST0002", new Date("2026-02-01T10:00:00Z")],
      ]),
    );
  });

  it("counts a dividend and ignores cash events, which have no instrument", () => {
    const first = firstEventByInstrument([
      deposit("1", "2025-12-01T10:00:00Z"),
      dividend("2", "XS00TEST0001", "2026-01-10T10:00:00Z"),
      trade("3", "BUY", "XS00TEST0001", "2026-01-20T10:00:00Z"),
    ]);
    expect(first).toEqual(
      new Map([["XS00TEST0001", new Date("2026-01-10T10:00:00Z")]]),
    );
  });
});

describe("firstTradeAt", () => {
  it("returns the earliest buy or sell across every instrument", () => {
    expect(
      firstTradeAt([
        deposit("1", "2025-11-01T10:00:00Z"),
        trade("2", "BUY", "XS00TEST0001", "2026-02-01T10:00:00Z"),
        dividend("3", "XS00TEST0002", "2025-12-01T10:00:00Z"),
        trade("4", "SELL", "XS00TEST0002", "2026-01-05T10:00:00Z"),
      ]),
    ).toEqual(new Date("2026-01-05T10:00:00Z"));
  });

  it("is undefined when there are no trades", () => {
    expect(
      firstTradeAt([deposit("1", "2026-01-01T10:00:00Z")]),
    ).toBeUndefined();
    expect(firstTradeAt([])).toBeUndefined();
  });
});
