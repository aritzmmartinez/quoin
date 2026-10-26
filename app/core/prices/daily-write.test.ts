import { describe, expect, it } from "vitest";

import type { PriceSnapshot } from "../ports";
import { planDailyWrite, type StoredPrice } from "./daily-write";

const LIVE = "YAHOO_LIVE";

const snap = (
  asOf: string,
  source = "YAHOO",
  price = "100.000000",
): PriceSnapshot => ({
  instrumentId: "XS00TEST0001",
  price,
  currency: "EUR",
  asOf: new Date(asOf),
  source,
});

const row = (
  id: string,
  asOf: string,
  source = "YAHOO",
  price = "100.000000",
): StoredPrice => ({ id, asOf: new Date(asOf), source, price, currency: "EUR" });

describe("planDailyWrite — one row per Madrid day once its candle exists", () => {
  it("a candle removes the live row of its day", () => {
    const plan = planDailyWrite(
      [row("live", "2026-10-09T15:35:00Z", LIVE)],
      [snap("2026-10-09T07:00:00Z")],
      null,
    );
    expect(plan.remove).toEqual(["live"]);
    expect(plan).toMatchObject({ inserted: 1, corrected: 0 });
  });

  it("a candle removes an old YAHOO row of its day too", () => {
    const plan = planDailyWrite(
      [row("legacy", "2026-10-09T15:35:16Z")],
      [snap("2026-10-09T07:00:00Z")],
      null,
    );
    expect(plan.remove).toEqual(["legacy"]);
  });

  it("a candle with a stored asOf and a new price is a correction", () => {
    const plan = planDailyWrite(
      [row("same", "2026-10-09T07:00:00Z")],
      [snap("2026-10-09T07:00:00Z", "YAHOO", "101.000000")],
      null,
    );
    expect(plan).toMatchObject({ remove: [], inserted: 0, corrected: 1 });
    expect(plan.write.map((s) => s.price)).toEqual(["101.000000"]);
  });

  it("a candle equal in value to the stored one, written differently, is no correction", () => {
    const plan = planDailyWrite(
      [row("same", "2026-10-09T07:00:00Z", "YAHOO", "100.000000")],
      [snap("2026-10-09T07:00:00Z", "YAHOO", "100")],
      null,
    );
    expect(plan).toMatchObject({ write: [], inserted: 0, corrected: 0 });
  });

  it("a candle already stored as it is writes nothing", () => {
    const plan = planDailyWrite(
      [row("same", "2026-10-09T07:00:00Z")],
      [snap("2026-10-09T07:00:00Z")],
      null,
    );
    expect(plan).toMatchObject({
      remove: [],
      write: [],
      inserted: 0,
      corrected: 0,
    });
  });

  it("replacing an old YAHOO row on another asOf is an insertion", () => {
    const plan = planDailyWrite(
      [row("legacy", "2026-10-14T15:35:00Z")],
      [snap("2026-10-14T07:00:00Z")],
      null,
    );
    expect(plan).toMatchObject({ remove: ["legacy"], inserted: 1, corrected: 0 });
  });

  it("leaves rows of other days alone, on Madrid days not UTC ones", () => {
    const plan = planDailyWrite(
      [
        row("prev-day", "2026-10-08T21:59:00Z"),
        row("same-day-early", "2026-10-08T22:30:00Z", LIVE),
      ],
      [snap("2026-10-09T07:00:00Z")],
      null,
    );
    expect(plan.remove).toEqual(["same-day-early"]);
  });
});

describe("planDailyWrite — the live quote", () => {
  it("replaces the live row already stored for that day", () => {
    const plan = planDailyWrite(
      [row("morning", "2026-10-14T08:10:00Z", LIVE)],
      [],
      snap("2026-10-14T15:35:00Z", LIVE),
    );
    expect(plan.remove).toEqual(["morning"]);
    expect(plan.live).toBe(true);
  });

  it("is not written on a day that already has a candle", () => {
    const plan = planDailyWrite(
      [row("candle", "2026-10-09T07:00:00Z")],
      [],
      snap("2026-10-09T15:35:00Z", LIVE),
    );
    expect(plan).toMatchObject({ remove: [], write: [], live: false });
  });

  it("is not written when the same batch brings that day's candle", () => {
    const plan = planDailyWrite(
      [],
      [snap("2026-10-09T07:00:00Z")],
      snap("2026-10-09T15:35:00Z", LIVE),
    );
    expect(plan.live).toBe(false);
    expect(plan.write).toHaveLength(1);
  });

  it("sits beside yesterday's new candle", () => {
    const plan = planDailyWrite(
      [],
      [snap("2026-10-14T07:00:00Z")],
      snap("2026-10-15T09:00:00Z", LIVE),
    );
    expect(plan.live).toBe(true);
    expect(plan.write).toHaveLength(2);
  });
});
