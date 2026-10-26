import { describe, expect, it } from "vitest";

import { findBalanceMismatch } from "./balance";
import { krakenCsv, type KrakenFixtureRow } from "./csv-fixture";
import { parseKrakenCsv } from "./row";

const rows = (fixture: KrakenFixtureRow[]) =>
  parseKrakenCsv(krakenCsv(fixture));

const deposit: KrakenFixtureRow = {
  refid: "D1",
  time: "2026-01-05 10:00:00",
  type: "deposit",
  subclass: "fiat",
  asset: "EUR",
  amount: "500",
};
const buy: KrakenFixtureRow[] = [
  {
    refid: "B1",
    time: "2026-01-06 10:00:00",
    type: "spend",
    subclass: "fiat",
    asset: "EUR",
    amount: "-100",
    fee: "1.5",
  },
  {
    refid: "B1",
    time: "2026-01-06 10:00:00",
    type: "receive",
    subclass: "crypto",
    asset: "BTC",
    amount: "0.001",
    fee: "0.000002",
  },
];

describe("findBalanceMismatch", () => {
  it("accepts a file whose balance is the previous one plus amount minus fee", () => {
    expect(findBalanceMismatch(rows([deposit, ...buy]))).toBeNull();
  });

  it("opens each asset and wallet at whatever its first row says", () => {
    const staked: KrakenFixtureRow = {
      refid: "E1",
      time: "2026-01-07 05:52:00",
      type: "earn",
      subtype: "reward",
      subclass: "crypto",
      asset: "BTC",
      wallet: "earn / flexible",
      amount: "0.0000004",
      fee: "0.0000001",
      balance: "0.5000003",
    };
    expect(findBalanceMismatch(rows([deposit, ...buy, staked]))).toBeNull();
  });

  it("names the asset, the wallet and the row's time when one does not follow", () => {
    const off: KrakenFixtureRow = {
      refid: "W1",
      time: "2026-01-08 09:00:00",
      type: "withdrawal",
      subclass: "fiat",
      asset: "EUR",
      amount: "-50",
      balance: "350",
    };
    expect(findBalanceMismatch(rows([deposit, ...buy, off]))).toEqual({
      asset: "EUR",
      wallet: "spot / main",
      date: "2026-01-08 09:00:00 UTC",
    });
  });

  it("refuses a balance that leaves the row's fee out", () => {
    const earn: KrakenFixtureRow = {
      refid: "E2",
      time: "2026-01-09 05:52:00",
      type: "earn",
      subtype: "reward",
      subclass: "crypto",
      asset: "BTC",
      amount: "0.000010",
      fee: "0.000003",
      balance: "0.001008",
    };
    expect(findBalanceMismatch(rows([deposit, ...buy, earn]))).toEqual({
      asset: "BTC",
      wallet: "spot / main",
      date: "2026-01-09 05:52:00 UTC",
    });
  });
});
