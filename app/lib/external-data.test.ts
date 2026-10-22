import { describe, expect, it } from "vitest";

import { inflationStatus, pricesStatus, ratesStatus } from "./external-data";

const at = (iso: string) => new Date(iso);

describe("pricesStatus", () => {
  it("dates the data by the instrument whose newest price is oldest, and names it", () => {
    const status = pricesStatus({
      relevant: [
        { id: "A", name: "Alpha" },
        { id: "B", name: "Beta" },
      ],
      latest: new Map([
        ["A", { asOf: at("2026-10-21T15:30:00Z") }],
        ["B", { asOf: at("2026-10-17T15:30:00Z") }],
        ["SOLD", { asOf: at("2024-01-02T15:30:00Z") }],
      ]),
      checked: new Map([
        ["A", at("2026-10-21T18:00:00Z")],
        ["B", at("2026-10-21T18:00:05Z")],
        ["SOLD", at("2026-10-22T09:00:00Z")],
      ]),
    });

    expect(status.until).toEqual({
      kind: "day",
      value: "2026-10-17",
      name: "Beta",
    });
    expect(status.lastChecked).toBe("2026-10-21T18:00:05.000Z");
  });

  it("names no instrument when every one reaches the same day", () => {
    const status = pricesStatus({
      relevant: [
        { id: "A", name: "Alpha" },
        { id: "B", name: "Beta" },
      ],
      latest: new Map([
        ["A", { asOf: at("2026-10-21T15:30:00Z") }],
        ["B", { asOf: at("2026-10-21T20:00:00Z") }],
      ]),
      checked: new Map(),
    });

    expect(status.until).toEqual({
      kind: "day",
      value: "2026-10-21",
      name: null,
    });
  });

  it("names the one behind even when it is listed first", () => {
    const status = pricesStatus({
      relevant: [
        { id: "B", name: "Beta" },
        { id: "A", name: "Alpha" },
      ],
      latest: new Map([
        ["A", { asOf: at("2026-10-21T15:30:00Z") }],
        ["B", { asOf: at("2026-10-17T15:30:00Z") }],
      ]),
      checked: new Map(),
    });

    expect(status.until?.name).toBe("Beta");
  });

  it("leaves a sold instrument with a stale symbol out of both figures", () => {
    const status = pricesStatus({
      relevant: [{ id: "A", name: "Alpha" }],
      latest: new Map([
        ["A", { asOf: at("2026-10-21T15:30:00Z") }],
        ["SOLD", { asOf: at("2024-01-02T15:30:00Z") }],
      ]),
      checked: new Map(),
    });

    expect(status.until).toEqual({
      kind: "day",
      value: "2026-10-21",
      name: null,
    });
    expect(status.lastChecked).toBeNull();
  });

  it("has no date when nothing relevant has a price yet", () => {
    expect(
      pricesStatus({
        relevant: [{ id: "A", name: "Alpha" }],
        latest: new Map(),
        checked: new Map(),
      }).until,
    ).toBeNull();
  });

  it("dates the data by the Madrid day of the price", () => {
    expect(
      pricesStatus({
        relevant: [{ id: "A", name: "Alpha" }],
        latest: new Map([["A", { asOf: at("2026-10-20T22:30:00Z") }]]),
        checked: new Map(),
      }).until?.value,
    ).toBe("2026-10-21");
  });
});

describe("ratesStatus", () => {
  it("dates the rates by the currency furthest behind, named when there are several", () => {
    const status = ratesStatus([
      {
        currency: "USD",
        lastDay: "2026-10-21",
        lastChecked: at("2026-10-21T17:00:00Z"),
      },
      {
        currency: "GBP",
        lastDay: "2026-10-14",
        lastChecked: at("2026-10-21T17:00:01Z"),
      },
    ]);

    expect(status.until).toEqual({
      kind: "day",
      value: "2026-10-14",
      name: "GBP",
    });
    expect(status.lastChecked).toBe("2026-10-21T17:00:01.000Z");
  });

  it("does not name the only currency in use", () => {
    expect(
      ratesStatus([
        { currency: "USD", lastDay: "2026-10-21", lastChecked: null },
      ]).until?.name,
    ).toBeNull();
  });

  it("has no date while some currency in use has no rate stored", () => {
    expect(
      ratesStatus([
        { currency: "USD", lastDay: "2026-10-21", lastChecked: null },
        { currency: "GBP", lastDay: null, lastChecked: null },
      ]).until,
    ).toBeNull();
  });

  it("is idle, with nothing pending, when no currency other than the euro is in use", () => {
    expect(ratesStatus([])).toEqual({
      lastChecked: null,
      until: null,
      idle: true,
    });
  });

  it("is not idle while some currency is in use, checked or not", () => {
    expect(
      ratesStatus([{ currency: "USD", lastDay: null, lastChecked: null }]).idle,
    ).toBe(false);
  });
});

describe("inflationStatus", () => {
  it("dates the index by the last month published, apart from the last check", () => {
    expect(inflationStatus("2026-09", at("2026-10-21T09:00:00Z"))).toEqual({
      idle: false,
      lastChecked: "2026-10-21T09:00:00.000Z",
      until: { kind: "period", value: "2026-09", name: null },
    });
  });

  it("has no date with no index stored", () => {
    expect(inflationStatus(null, null).until).toBeNull();
  });
});
