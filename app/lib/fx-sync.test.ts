import { describe, it, expect } from "vitest";

import { planFxWrite } from "~/core/fx";
import {
  FxRatesUnavailableError,
  fxSeriesKey,
  type FxRate,
  type FxRateProvider,
  type FxSeries,
} from "~/core/ports";

import {
  FIRST_USE_MARGIN_DAYS,
  UNUSED_LOOKBACK_DAYS,
  firstUseByCurrency,
  syncFxRates,
  syncStart,
  type FxSyncDeps,
} from "./fx-sync";

const rate = (quote: string, day: string, value: string): FxRate => ({
  source: "ECB",
  base: "EUR",
  quote,
  day,
  rate: value,
});

function fakeRepository(initial: FxRate[] = []) {
  const rows = [...initial];
  const checked: string[] = [];
  const days = (series: FxSeries) =>
    rows
      .filter((r) => fxSeriesKey(r) === fxSeriesKey(series))
      .map((r) => r.day)
      .sort();
  const repository: FxSyncDeps["repository"] = {
    async save(series, rates) {
      const stored = rows.filter((r) => fxSeriesKey(r) === fxSeriesKey(series));
      const { write, ...result } = planFxWrite(series, stored, rates);
      rows.push(...write);
      return result;
    },
    async firstDay(series) {
      return days(series)[0] ?? null;
    },
    async lastDay(series) {
      return days(series).at(-1) ?? null;
    },
    async markChecked(series) {
      checked.push(fxSeriesKey(series));
    },
  };
  return { repository, rows, checked };
}

function fakeProvider(published: () => FxRate[]) {
  const calls: { quote: string; from: string; to: string }[] = [];
  const provider: FxRateProvider = {
    source: "ECB",
    base: "EUR",
    async getRates(quote, from, to) {
      calls.push({ quote, from, to });
      return published().filter(
        (r) => r.quote === quote && r.day >= from && r.day <= to,
      );
    },
  };
  return { provider, calls };
}

describe("syncFxRates", () => {
  it("asks a series never stored from a week before the currency was first used", async () => {
    const { repository, rows, checked } = fakeRepository();
    const { provider, calls } = fakeProvider(() => [
      rate("USD", "2026-03-30", "1.2030"),
      rate("USD", "2026-04-02", "1.2002"),
    ]);

    const result = await syncFxRates({
      repository,
      provider,
      currencies: ["USD"],
      firstUse: new Map([["USD", "2026-04-06"]]),
      now: new Date("2026-04-07T18:00:00Z"),
    });

    expect(FIRST_USE_MARGIN_DAYS).toBe(7);
    expect(calls).toEqual([
      { quote: "USD", from: "2026-03-30", to: "2026-04-07" },
    ]);
    expect(rows).toHaveLength(2);
    expect(checked).toEqual(["ECB:EUR:USD"]);
    expect(result.inserted).toBe(2);
    expect(result.outcomes).toEqual([
      {
        quote: "USD",
        status: "written",
        from: "2026-03-30",
        inserted: 2,
        unchanged: 0,
        lastDay: "2026-04-02",
      },
    ]);
  });

  it("covers Easter Monday's purchase with Maundy Thursday's rate inside the margin", async () => {
    const { repository, rows } = fakeRepository();
    const { provider } = fakeProvider(() => [
      rate("USD", "2026-04-02", "1.2002"),
    ]);

    await syncFxRates({
      repository,
      provider,
      currencies: ["USD"],
      firstUse: new Map([["USD", "2026-04-06"]]),
      now: new Date("2026-04-06T18:00:00Z"),
    });

    expect(rows.map((r) => r.day)).toEqual(["2026-04-02"]);
  });

  it("asks a code given by hand and not in use for the last month only", async () => {
    const { repository } = fakeRepository();
    const { provider, calls } = fakeProvider(() => []);

    await syncFxRates({
      repository,
      provider,
      currencies: ["CHF"],
      firstUse: new Map(),
      now: new Date("2026-04-07T18:00:00Z"),
    });

    expect(UNUSED_LOOKBACK_DAYS).toBe(30);
    expect(calls[0]?.from).toBe("2026-03-08");
  });

  it("asks again for a day that had no rate yet, from the last day stored, not the last check", async () => {
    const { repository, rows, checked } = fakeRepository([
      rate("USD", "2026-04-02", "1.2002"),
    ]);
    let published = [rate("USD", "2026-04-02", "1.2002")];
    const { provider, calls } = fakeProvider(() => published);
    const firstUse = new Map([["USD", "2026-04-02"]]);

    await syncFxRates({
      repository,
      provider,
      currencies: ["USD"],
      firstUse,
      now: new Date("2026-04-07T08:00:00Z"),
    });

    expect(rows.map((r) => r.day)).toEqual(["2026-04-02"]);
    expect(checked).toEqual(["ECB:EUR:USD"]);

    published = [...published, rate("USD", "2026-04-07", "1.2007")];
    const later = await syncFxRates({
      repository,
      provider,
      currencies: ["USD"],
      firstUse,
      now: new Date("2026-04-07T15:30:00Z"),
    });

    expect(calls.map((c) => c.from)).toEqual(["2026-04-02", "2026-04-02"]);
    expect(rows.map((r) => r.day)).toEqual(["2026-04-02", "2026-04-07"]);
    expect(later.outcomes[0]).toMatchObject({
      status: "written",
      inserted: 1,
      unchanged: 1,
      lastDay: "2026-04-07",
    });
  });

  it("goes back for an older purchase imported after the series was stored", async () => {
    const { repository, rows } = fakeRepository([
      rate("USD", "2026-04-02", "1.2002"),
    ]);
    const { provider, calls } = fakeProvider(() => [
      rate("USD", "2026-02-20", "1.2220"),
      rate("USD", "2026-04-02", "1.2002"),
    ]);

    await syncFxRates({
      repository,
      provider,
      currencies: ["USD"],
      firstUse: new Map([["USD", "2026-02-27"]]),
      now: new Date("2026-04-07T18:00:00Z"),
    });

    expect(calls[0]?.from).toBe("2026-02-20");
    expect(rows.map((r) => r.day).sort()).toEqual([
      "2026-02-20",
      "2026-04-02",
    ]);
  });

  it("asks up to today's Madrid day, not today's UTC day", async () => {
    const { repository } = fakeRepository();
    const { provider, calls } = fakeProvider(() => []);

    await syncFxRates({
      repository,
      provider,
      currencies: ["USD"],
      firstUse: new Map(),
      now: new Date("2026-04-06T22:30:00Z"),
    });

    expect(calls[0]?.to).toBe("2026-04-07");
  });

  it("writes nothing for a series whose stored rates were revised, and names it", async () => {
    const stored = rate("USD", "2026-04-02", "1.2002");
    const { repository, rows } = fakeRepository([stored]);
    const revised = rate("USD", "2026-04-02", "1.2003");
    const { provider } = fakeProvider(() => [
      revised,
      rate("USD", "2026-04-07", "1.2007"),
    ]);

    const result = await syncFxRates({
      repository,
      provider,
      currencies: ["USD"],
      firstUse: new Map([["USD", "2026-04-02"]]),
      now: new Date("2026-04-07T18:00:00Z"),
    });

    expect(rows).toEqual([stored]);
    expect(result.conflicted).toEqual(["USD"]);
    expect(result.outcomes).toEqual([
      {
        quote: "USD",
        status: "conflict",
        conflicts: [{ stored, incoming: revised }],
      },
    ]);
  });

  it("carries on past an unanswered currency, without recording a check for it", async () => {
    const { repository, rows, checked } = fakeRepository();
    const provider: FxRateProvider = {
      source: "ECB",
      base: "EUR",
      async getRates(quote) {
        if (quote === "GBP") throw new FxRatesUnavailableError(quote, 503);
        return [rate(quote, "2026-04-02", "1.2002")];
      },
    };

    const result = await syncFxRates({
      repository,
      provider,
      currencies: ["GBP", "USD"],
      firstUse: new Map(),
      now: new Date("2026-04-07T18:00:00Z"),
    });

    expect(result.unavailable).toEqual(["GBP"]);
    expect(checked).toEqual(["ECB:EUR:USD"]);
    expect(rows.map((r) => r.quote)).toEqual(["USD"]);
  });

  it("records a check for a currency the source does not publish", async () => {
    const { repository, checked } = fakeRepository();
    const { provider } = fakeProvider(() => []);

    const result = await syncFxRates({
      repository,
      provider,
      currencies: ["USDG"],
      firstUse: new Map([["USDG", "2026-04-02"]]),
      now: new Date("2026-04-07T18:00:00Z"),
    });

    expect(checked).toEqual(["ECB:EUR:USDG"]);
    expect(result.outcomes[0]).toMatchObject({
      status: "written",
      inserted: 0,
      lastDay: null,
    });
  });
});

describe("syncStart", () => {
  const stored = { first: "2026-04-02", last: "2026-04-07" };

  it("starts a series never stored where it is needed", () => {
    expect(
      syncStart("2026-03-30", "2026-04-06", { first: null, last: null }),
    ).toBe("2026-03-30");
  });

  it("restarts from the last day stored once the first use is covered", () => {
    expect(syncStart("2026-03-30", "2026-04-06", stored)).toBe("2026-04-07");
  });

  it("does not go back for a margin that fell on days with no rate", () => {
    expect(syncStart("2026-03-26", "2026-04-02", stored)).toBe("2026-04-07");
  });

  it("goes back when the currency was first used before the first day stored", () => {
    expect(syncStart("2026-02-20", "2026-02-27", stored)).toBe("2026-02-20");
  });

  it("never goes back for a code that is not in use", () => {
    expect(syncStart("2026-03-08", null, stored)).toBe("2026-04-07");
  });
});

describe("firstUseByCurrency", () => {
  it("keeps the earliest Madrid day of each currency but the base", () => {
    expect(
      firstUseByCurrency([
        { currency: "USD", at: new Date("2026-04-07T10:00:00Z") },
        { currency: "EUR", at: new Date("2025-01-01T10:00:00Z") },
        { currency: "GBP", at: new Date("2026-03-31T22:30:00Z") },
        { currency: "USD", at: new Date("2026-02-27T10:00:00Z") },
      ]),
    ).toEqual(
      new Map([
        ["GBP", "2026-04-01"],
        ["USD", "2026-02-27"],
      ]),
    );
  });

  it("is empty for a portfolio held only in the base currency", () => {
    expect(
      firstUseByCurrency([
        { currency: "EUR", at: new Date("2026-04-07T10:00:00Z") },
      ]),
    ).toEqual(new Map());
  });
});
