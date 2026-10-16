import { describe, expect, it } from "vitest";

import { es } from "./i18n";

import { MAX_QUOTE_AGE_MS } from "~/adapters/marketdata";
import type {
  HistorySpan,
  MarketDataProvider,
  PriceRepository,
  PriceSnapshot,
  Quote,
} from "~/core/ports";
import { planDailyWrite } from "~/core/prices";

import { inTurn } from "./in-turn";
import {
  failedSync,
  priceSyncToast,
  splitUnmapped,
  SYNC_OVERLAP_DAYS,
  syncInstrumentPrices,
  toSyncTargets,
  type SyncTarget,
} from "./prices-sync";

const ETF: SyncTarget = { id: "XS00TEST0001", name: "Fund A", quoteSymbol: "AAA.DE" };
const BTC: SyncTarget = { id: "BTC", name: "Bitcoin", quoteSymbol: "BTC-EUR" };

const at = (iso: string) => new Date(iso);
const q = (symbol: string, asOf: string, price = "10", currency = "EUR"): Quote => ({
  symbol,
  price,
  currency,
  asOf: at(asOf),
});

function memory(seed: Record<string, [string, string][]> = {}) {
  let next = 0;
  const rows: (PriceSnapshot & { id: string })[] = [];
  for (const [instrumentId, list] of Object.entries(seed)) {
    for (const [asOf, source] of list) {
      rows.push({
        id: `seed${next++}`,
        instrumentId,
        price: "1",
        currency: "EUR",
        asOf: at(asOf),
        source,
      });
    }
  }
  const of = (id: string) =>
    rows.filter((r) => r.instrumentId === id).sort((a, b) => +a.asOf - +b.asOf);
  const prices = {
    lastAsOf: async (id: string) => of(id).at(-1)?.asOf ?? null,
    saveDaily: async (
      id: string,
      candles: readonly PriceSnapshot[],
      live: PriceSnapshot | null,
    ) => {
      const plan = planDailyWrite(of(id), candles, live);
      for (const removed of plan.remove) {
        rows.splice(rows.findIndex((r) => r.id === removed), 1);
      }
      for (const s of plan.write) {
        const same = rows.find(
          (r) => r.instrumentId === id && +r.asOf === +s.asOf,
        );
        if (same) Object.assign(same, s);
        else rows.push({ ...s, id: `w${next++}` });
      }
      return {
        inserted: plan.inserted,
        corrected: plan.corrected,
        live: plan.live,
      };
    },
  } as unknown as PriceRepository;
  const view = (id: string) =>
    of(id).map((r) => `${r.asOf.toISOString().slice(0, 16)} ${r.source}`);
  return { prices, view };
}

function yahoo(
  history: Record<string, Quote[]>,
  live: Quote[] = [],
  spans: HistorySpan[] = [],
): MarketDataProvider {
  return {
    source: "YAHOO",
    getQuotes: async (symbols) => live.filter((x) => symbols.includes(x.symbol)),
    getHistory: async (symbol, range) => {
      const span = range as HistorySpan;
      spans.push(span);
      return (history[symbol] ?? []).filter(
        (x) => x.asOf >= span.from && x.asOf <= span.to,
      );
    },
  };
}

describe("syncInstrumentPrices — filling the gaps", () => {
  it("an exchange: weekdays only, today's unfinished candle dropped", async () => {
    const { prices, view } = memory({ [ETF.id]: [["2026-10-07T07:00Z", "YAHOO"]] });
    const provider = yahoo(
      {
        "AAA.DE": [
          q("AAA.DE", "2026-10-07T07:00Z"),
          q("AAA.DE", "2026-10-08T07:00Z"),
          q("AAA.DE", "2026-10-09T07:00Z"),
          q("AAA.DE", "2026-10-12T07:00Z"),
        ],
      },
      [q("AAA.DE", "2026-10-12T09:30Z")],
    );

    const sync = await syncInstrumentPrices(
      { prices, provider, now: at("2026-10-12T10:00Z") },
      ETF,
    );

    expect(sync).toMatchObject({
      inserted: 2,
      corrected: 1,
      live: true,
      problem: null,
    });
    expect(view(ETF.id)).toEqual([
      "2026-10-07T07:00 YAHOO",
      "2026-10-08T07:00 YAHOO",
      "2026-10-09T07:00 YAHOO",
      "2026-10-12T09:30 YAHOO_LIVE",
    ]);
  });

  it("crypto: every calendar day, weekend included", async () => {
    const { prices, view } = memory({ [BTC.id]: [["2026-10-09T00:00Z", "YAHOO"]] });
    const days = ["09", "10", "11", "12"].map((d) =>
      q("BTC-EUR", `2026-10-${d}T00:00Z`),
    );
    const provider = yahoo({ "BTC-EUR": days }, [q("BTC-EUR", "2026-10-13T08:00Z")]);

    await syncInstrumentPrices({ prices, provider, now: at("2026-10-13T08:05Z") }, BTC);

    expect(view(BTC.id)).toEqual([
      "2026-10-09T00:00 YAHOO",
      "2026-10-10T00:00 YAHOO",
      "2026-10-11T00:00 YAHOO",
      "2026-10-12T00:00 YAHOO",
      "2026-10-13T08:00 YAHOO_LIVE",
    ]);
  });

  it("an empty answer over a weekend is not a failure", async () => {
    const { prices, view } = memory({ [ETF.id]: [["2026-10-09T07:00Z", "YAHOO"]] });
    const provider = yahoo({}, [q("AAA.DE", "2026-10-09T15:35Z")]);

    const sync = await syncInstrumentPrices(
      { prices, provider, now: at("2026-10-11T10:00Z") },
      ETF,
    );

    expect(sync.problem).toBeNull();
    expect(view(ETF.id)).toEqual([
      "2026-10-09T07:00 YAHOO",
    ]);
  });

  it("a Saturday quote is dated Friday and not written over Friday's candle", async () => {
    const { prices, view } = memory({ [ETF.id]: [["2026-10-08T07:00Z", "YAHOO"]] });
    const provider = yahoo(
      { "AAA.DE": [q("AAA.DE", "2026-10-09T07:00Z")] },
      [q("AAA.DE", "2026-10-09T15:35Z")],
    );

    const sync = await syncInstrumentPrices(
      { prices, provider, now: at("2026-10-10T10:00Z") },
      ETF,
    );

    expect(sync).toMatchObject({
      inserted: 1,
      corrected: 0,
      live: false,
      problem: null,
    });
    expect(view(ETF.id)).toEqual([
      "2026-10-08T07:00 YAHOO",
      "2026-10-09T07:00 YAHOO",
    ]);
  });

  it("fills a gap inside the window even when the last row is a live quote", async () => {
    const { prices, view } = memory({
      [ETF.id]: [
        ["2026-10-09T07:00Z", "YAHOO"],
        ["2026-10-09T15:35Z", "YAHOO"],
        ["2026-10-14T15:37Z", "YAHOO"],
      ],
    });
    const spans: HistorySpan[] = [];
    const candles = ["07", "08", "09", "12", "13", "14"].map((d) =>
      q("AAA.DE", `2026-10-${d}T07:00Z`),
    );
    const provider = yahoo({ "AAA.DE": candles }, [q("AAA.DE", "2026-10-15T08:00Z")], spans);

    await syncInstrumentPrices({ prices, provider, now: at("2026-10-15T08:05Z") }, ETF);

    expect(spans[0]?.from.getTime()).toBeLessThanOrEqual(at("2026-10-06T22:00Z").getTime());
    expect(view(ETF.id)).toEqual([
      "2026-10-07T07:00 YAHOO",
      "2026-10-08T07:00 YAHOO",
      "2026-10-09T07:00 YAHOO",
      "2026-10-12T07:00 YAHOO",
      "2026-10-13T07:00 YAHOO",
      "2026-10-14T07:00 YAHOO",
      "2026-10-15T08:00 YAHOO_LIVE",
    ]);
  });

  it("reaches SYNC_OVERLAP_DAYS Madrid days back from the last row", async () => {
    expect(SYNC_OVERLAP_DAYS).toBe(7);
    const { prices, view } = memory({ [ETF.id]: [["2026-10-14T15:37Z", "YAHOO_LIVE"]] });
    const provider = yahoo({
      "AAA.DE": [
        q("AAA.DE", "2026-10-06T21:59Z"),
        q("AAA.DE", "2026-10-06T22:00Z"),
      ],
    });

    await syncInstrumentPrices({ prices, provider, now: at("2026-10-15T08:00Z") }, ETF);

    expect(view(ETF.id)).toEqual([
      "2026-10-06T22:00 YAHOO",
      "2026-10-14T15:37 YAHOO_LIVE",
    ]);
  });

  it("asks for no history when the instrument has none, and writes the live quote", async () => {
    const { prices, view } = memory();
    const spans: HistorySpan[] = [];
    const provider = yahoo({}, [q("AAA.DE", "2026-10-15T08:00Z")], spans);

    const sync = await syncInstrumentPrices(
      { prices, provider, now: at("2026-10-15T08:05Z") },
      ETF,
    );

    expect(spans).toEqual([]);
    expect(sync).toMatchObject({ inserted: 0, corrected: 0, live: true });
    expect(view(ETF.id)).toEqual(["2026-10-15T08:00 YAHOO_LIVE"]);
  });
});

describe("syncInstrumentPrices — syncing again", () => {
  it("the same answer from Yahoo inserts and corrects nothing, and leaves past rows identical", async () => {
    const { prices, view } = memory({ [ETF.id]: [["2026-10-09T07:00Z", "YAHOO"]] });
    const candles = ["09", "12", "13", "14"].map((d) =>
      q("AAA.DE", `2026-10-${d}T07:00Z`),
    );
    const provider = yahoo({ "AAA.DE": candles }, [q("AAA.DE", "2026-10-15T08:00Z")]);
    const deps = { prices, provider, now: at("2026-10-15T08:05Z") };

    const first = await syncInstrumentPrices(deps, ETF);
    const before = view(ETF.id);
    const second = await syncInstrumentPrices(deps, ETF);

    expect(first).toMatchObject({ inserted: 3, corrected: 1 });
    expect(second).toMatchObject({ inserted: 0, corrected: 0, live: true });
    expect(view(ETF.id)).toEqual(before);
  });
});

describe("syncInstrumentPrices — the live quote", () => {
  it("replaces the day's earlier live row", async () => {
    const { prices, view } = memory({ [ETF.id]: [["2026-10-15T07:30Z", "YAHOO_LIVE"]] });
    const provider = yahoo({}, [q("AAA.DE", "2026-10-15T15:35Z")]);

    await syncInstrumentPrices({ prices, provider, now: at("2026-10-15T16:00Z") }, ETF);

    expect(view(ETF.id)).toEqual(["2026-10-15T15:35 YAHOO_LIVE"]);
  });

  it("is removed when that day's candle arrives, and latest() never goes back a day", async () => {
    const { prices, view } = memory({
      [ETF.id]: [
        ["2026-10-13T07:00Z", "YAHOO"],
        ["2026-10-14T15:35Z", "YAHOO_LIVE"],
      ],
    });
    const provider = yahoo(
      { "AAA.DE": [q("AAA.DE", "2026-10-13T07:00Z"), q("AAA.DE", "2026-10-14T07:00Z")] },
      [q("AAA.DE", "2026-10-15T08:00Z")],
    );

    await syncInstrumentPrices({ prices, provider, now: at("2026-10-15T08:05Z") }, ETF);

    expect(view(ETF.id)).toEqual([
      "2026-10-13T07:00 YAHOO",
      "2026-10-14T07:00 YAHOO",
      "2026-10-15T08:00 YAHOO_LIVE",
    ]);
  });

  it("refuses a stale quote but keeps the candles", async () => {
    const { prices } = memory({ [ETF.id]: [["2026-10-01T07:00Z", "YAHOO"]] });
    const now = at("2026-10-15T08:00Z");
    const old = new Date(now.getTime() - MAX_QUOTE_AGE_MS - 1).toISOString();
    const provider = yahoo(
      { "AAA.DE": [q("AAA.DE", "2026-10-02T07:00Z")] },
      [q("AAA.DE", old)],
    );

    expect(await syncInstrumentPrices({ prices, provider, now }, ETF)).toMatchObject({
      inserted: 1,
      live: false,
      problem: "stale",
    });
  });

  it("reports a missing quote", async () => {
    const { prices } = memory();
    const provider = yahoo({});
    expect(
      (await syncInstrumentPrices({ prices, provider, now: at("2026-10-15T08:00Z") }, ETF))
        .problem,
    ).toBe("no-quote");
  });
});

describe("syncInstrumentPrices — only euros", () => {
  it("writes nothing when the candles are not in EUR", async () => {
    const { prices, view } = memory({ [ETF.id]: [["2026-10-13T07:00Z", "YAHOO"]] });
    const provider = yahoo(
      { "AAA.DE": [q("AAA.DE", "2026-10-14T13:30Z", "10", "USD")] },
      [q("AAA.DE", "2026-10-15T13:30Z")],
    );

    const sync = await syncInstrumentPrices(
      { prices, provider, now: at("2026-10-15T14:00Z") },
      ETF,
    );

    expect(sync).toMatchObject({
      inserted: 0,
      corrected: 0,
      live: false,
      problem: "not-eur",
    });
    expect(view(ETF.id)).toEqual(["2026-10-13T07:00 YAHOO"]);
  });

  it("refuses a live quote not in EUR", async () => {
    const { prices, view } = memory();
    const provider = yahoo({}, [q("AAA.DE", "2026-10-15T13:30Z", "10", "USD")]);

    const sync = await syncInstrumentPrices(
      { prices, provider, now: at("2026-10-15T14:00Z") },
      ETF,
    );

    expect(sync).toMatchObject({ live: false, problem: "not-eur" });
    expect(view(ETF.id)).toEqual([]);
  });
});

describe("syncing instruments in turn", () => {
  it("carries on past an instrument that throws and names it", async () => {
    const { prices } = memory();
    const provider = yahoo({}, [
      q("AAA.DE", "2026-10-15T08:00Z"),
      q("BTC-EUR", "2026-10-15T08:00Z"),
    ]);
    const broken: SyncTarget = { id: "XS00TEST0002", name: "Broken", quoteSymbol: "BAD" };
    const deps = { prices, provider, now: at("2026-10-15T08:05Z") };

    const steps = await inTurn(
      [ETF, broken, BTC],
      (target) => {
        if (target === broken) throw new Error("boom");
        return syncInstrumentPrices(deps, target);
      },
      { onError: (_error, target) => failedSync(target) },
    );

    expect(steps.map((s) => [s.name, s.problem])).toEqual([
      ["Fund A", null],
      ["Broken", "error"],
      ["Bitcoin", null],
    ]);
    const toast = priceSyncToast(es, steps, { open: 0, closed: 0 });
    expect(toast.message).toBe(es.instruments.sync.done(2, 3));
    expect(toast.failures).toEqual([
      { name: "Broken", reason: es.instruments.sync.problem.error },
    ]);
  });
});

describe("toSyncTargets / splitUnmapped", () => {
  it("every instrument with a symbol is a target, open or closed", () => {
    const { targets, unmapped } = toSyncTargets([
      { id: "A", name: "A", quoteSymbol: "A.DE" },
      { id: "B", name: "B", quoteSymbol: null },
    ]);
    expect(targets).toEqual([{ id: "A", name: "A", quoteSymbol: "A.DE" }]);
    expect(splitUnmapped(unmapped, new Set(["B"]))).toEqual({ open: 1, closed: 0 });
  });
});

describe("priceSyncToast", () => {
  const ok = (inserted: number, corrected = 0) => ({
    instrumentId: "A",
    name: "A",
    inserted,
    corrected,
    live: true,
    problem: null,
  });

  it("says when nothing has a symbol", () => {
    expect(priceSyncToast(es, [], { open: 0, closed: 0 }).message).toBe(
      es.instruments.sync.nothing,
    );
  });

  it("leaves out the recovered line when nothing was inserted, corrections included", () => {
    expect(
      priceSyncToast(es, [ok(0, 4)], { open: 0, closed: 0 }).description,
    ).toBeUndefined();
  });

  it("counts recovered candles and unmapped positions", () => {
    const toast = priceSyncToast(es, [ok(2), ok(1)], { open: 1, closed: 0 });
    expect(toast.description).toBe(
      `${es.instruments.sync.candles(3)}. ${es.instruments.sync.unmappedOpen(1)}. ${es.instruments.sync.unmappedAction}`,
    );
  });
});
