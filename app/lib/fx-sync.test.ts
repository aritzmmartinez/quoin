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
  FIRST_ECB_DAY,
  currenciesInUse,
  syncFxRates,
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
  const ofSeries = (series: FxSeries) =>
    rows.filter((r) => fxSeriesKey(r) === fxSeriesKey(series));
  const repository: FxSyncDeps["repository"] = {
    async save(series, rates) {
      const { write, ...result } = planFxWrite(series, ofSeries(series), rates);
      rows.push(...write);
      return result;
    },
    async lastDay(series) {
      return (
        ofSeries(series)
          .map((r) => r.day)
          .sort()
          .at(-1) ?? null
      );
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
  it("asks a series never stored for the whole history up to today", async () => {
    const { repository, rows, checked } = fakeRepository();
    const { provider, calls } = fakeProvider(() => [
      rate("USD", "2026-04-01", "1.2001"),
      rate("USD", "2026-04-02", "1.2002"),
    ]);

    const result = await syncFxRates({
      repository,
      provider,
      currencies: ["USD"],
      now: new Date("2026-04-07T18:00:00Z"),
    });

    expect(calls).toEqual([
      { quote: "USD", from: FIRST_ECB_DAY, to: "2026-04-07" },
    ]);
    expect(rows).toHaveLength(2);
    expect(checked).toEqual(["ECB:EUR:USD"]);
    expect(result.inserted).toBe(2);
    expect(result.outcomes).toEqual([
      {
        quote: "USD",
        status: "written",
        from: FIRST_ECB_DAY,
        inserted: 2,
        unchanged: 0,
        lastDay: "2026-04-02",
      },
    ]);
  });

  it("asks again for a day that had no rate yet, from the last day stored, not the last check", async () => {
    const { repository, rows, checked } = fakeRepository([
      rate("USD", "2026-04-02", "1.2002"),
    ]);
    let published = [rate("USD", "2026-04-02", "1.2002")];
    const { provider, calls } = fakeProvider(() => published);

    await syncFxRates({
      repository,
      provider,
      currencies: ["USD"],
      now: new Date("2026-04-07T08:00:00Z"),
    });

    expect(rows.map((r) => r.day)).toEqual(["2026-04-02"]);
    expect(checked).toEqual(["ECB:EUR:USD"]);

    published = [...published, rate("USD", "2026-04-07", "1.2007")];
    const later = await syncFxRates({
      repository,
      provider,
      currencies: ["USD"],
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

  it("asks up to today's Madrid day, not today's UTC day", async () => {
    const { repository } = fakeRepository();
    const { provider, calls } = fakeProvider(() => []);

    await syncFxRates({
      repository,
      provider,
      currencies: ["USD"],
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

describe("currenciesInUse", () => {
  it("lists every currency but the base once, sorted", () => {
    expect(currenciesInUse(["USD", "EUR", "GBP", "USD", "EUR"])).toEqual([
      "GBP",
      "USD",
    ]);
  });

  it("is empty for a portfolio held only in the base currency", () => {
    expect(currenciesInUse(["EUR", "EUR"])).toEqual([]);
  });
});
