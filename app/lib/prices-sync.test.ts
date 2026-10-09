import { describe, expect, it } from "vitest";

import { es } from "./i18n";

import { MAX_QUOTE_AGE_MS } from "~/adapters/marketdata";
import type { Quote } from "~/core/ports";

import {
  planPriceSync,
  priceSyncToast,
  splitUnmapped,
  type SyncableInstrument,
} from "./prices-sync";

const NOW = new Date("2026-09-02T12:00:00Z");

const instrument = (
  id: string,
  quoteSymbol: string | null,
): SyncableInstrument => ({ id, name: `Fund ${id}`, quoteSymbol });

const quote = (symbol: string, asOf: Date, price = "10.00"): Quote => ({
  symbol,
  price,
  currency: "EUR",
  asOf,
});

const fresh = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
const ancient = new Date(NOW.getTime() - MAX_QUOTE_AGE_MS - 1);

describe("planPriceSync", () => {
  it("turns a fresh quote into a snapshot carrying the provider source", () => {
    const plan = planPriceSync(
      [instrument("A", "AAA.DE")],
      [quote("AAA.DE", fresh, "12.34")],
      "YAHOO",
      NOW,
    );

    expect(plan.snapshots).toEqual([
      {
        instrumentId: "A",
        price: "12.34",
        currency: "EUR",
        asOf: fresh,
        source: "YAHOO",
      },
    ]);
    expect(plan.failures).toEqual([]);
    expect(plan.mapped).toBe(1);
  });

  it("reports an instrument with no quote symbol as unmapped, not as a failure", () => {
    const plan = planPriceSync([instrument("A", null)], [], "YAHOO", NOW);

    expect(plan.mapped).toBe(0);
    expect(plan.unmapped).toEqual([{ instrumentId: "A", name: "Fund A" }]);
    expect(plan.failures).toEqual([]);
  });

  it("drops a stale quote and reports it rather than persisting it", () => {
    const plan = planPriceSync(
      [instrument("A", "AAA.DE")],
      [quote("AAA.DE", ancient)],
      "YAHOO",
      NOW,
    );

    expect(plan.snapshots).toEqual([]);
    expect(plan.failures).toEqual([
      {
        instrumentId: "A",
        name: "Fund A",
        symbol: "AAA.DE",
        reason: "stale",
        asOf: ancient,
      },
    ]);
  });

  it("reports a symbol the provider never answered for", () => {
    const plan = planPriceSync([instrument("A", "AAA.DE")], [], "YAHOO", NOW);

    expect(plan.failures).toEqual([
      {
        instrumentId: "A",
        name: "Fund A",
        symbol: "AAA.DE",
        reason: "no-quote",
        asOf: null,
      },
    ]);
  });

  it("keeps the successes when only some symbols fail", () => {
    const plan = planPriceSync(
      [
        instrument("A", "AAA.DE"),
        instrument("B", "BBB.DE"),
        instrument("C", "CCC.DE"),
      ],
      [quote("AAA.DE", fresh), quote("BBB.DE", ancient)],
      "YAHOO",
      NOW,
    );

    expect(plan.snapshots.map((s) => s.instrumentId)).toEqual(["A"]);
    expect(plan.failures.map((f) => [f.instrumentId, f.reason])).toEqual([
      ["B", "stale"],
      ["C", "no-quote"],
    ]);
  });

  it("accounts for every mapped instrument exactly once", () => {
    const plan = planPriceSync(
      [
        instrument("A", "AAA.DE"),
        instrument("B", "BBB.DE"),
        instrument("C", "CCC.DE"),
        instrument("D", null),
      ],
      [quote("AAA.DE", fresh), quote("BBB.DE", ancient)],
      "YAHOO",
      NOW,
    );

    expect(plan.mapped).toBe(3);
    expect(plan.snapshots.length + plan.failures.length).toBe(plan.mapped);
  });

  it("syncs both instruments when two of them share one quote symbol", () => {
    const plan = planPriceSync(
      [instrument("A", "AAA.DE"), instrument("B", "AAA.DE")],
      [quote("AAA.DE", fresh)],
      "YAHOO",
      NOW,
    );

    expect(plan.snapshots.map((s) => s.instrumentId)).toEqual(["A", "B"]);
    expect(plan.failures).toEqual([]);
  });

  it("ignores a quote for a symbol nobody maps", () => {
    const plan = planPriceSync(
      [instrument("A", "AAA.DE")],
      [quote("ZZZ.DE", fresh), quote("AAA.DE", fresh)],
      "YAHOO",
      NOW,
    );

    expect(plan.snapshots).toHaveLength(1);
    expect(plan.snapshots[0]?.instrumentId).toBe("A");
  });
});

describe("splitUnmapped", () => {
  it("counts open and closed positions without a symbol separately", () => {
    const unmapped = ["A", "B", "C"].map((id) => ({
      instrumentId: id,
      name: `Fund ${id}`,
    }));

    expect(splitUnmapped(unmapped, new Set(["A", "C", "Z"]))).toEqual({
      open: 2,
      closed: 1,
    });
    expect(splitUnmapped([], new Set(["A"]))).toEqual({ open: 0, closed: 0 });
  });
});

const NONE = { unmappedOpen: 0, unmappedClosed: 0 };

describe("priceSyncToast", () => {
  it("reports a clean run without mentioning failures", () => {
    expect(
      priceSyncToast(es, { mapped: 20, updated: 20, stale: 0, noQuote: 0, ...NONE }),
    ).toEqual({
      message: "20 de 20 precios actualizados",
    });
  });

  it("names the misses when only some prices came back", () => {
    expect(
      priceSyncToast(es, { mapped: 20, updated: 18, stale: 1, noQuote: 1, ...NONE }),
    ).toEqual({
      message: "18 de 20 precios actualizados, 2 fallidos",
      description: "1 con cotización caducada · 1 sin respuesta",
    });
  });

  it("describes only the failure kinds that actually happened", () => {
    expect(
      priceSyncToast(es, { mapped: 5, updated: 3, stale: 0, noQuote: 2, ...NONE }),
    ).toEqual({
      message: "3 de 5 precios actualizados, 2 fallidos",
      description: "2 sin respuesta",
    });
  });

  it("says nothing is mapped rather than reporting 0 of 0", () => {
    expect(
      priceSyncToast(es, { mapped: 0, updated: 0, stale: 0, noQuote: 0, ...NONE }),
    ).toEqual({
      message: "Ningún instrumento tiene símbolo de cotización todavía.",
    });
  });

  it("keeps the singular when a single instrument is mapped", () => {
    expect(
      priceSyncToast(es, { mapped: 1, updated: 1, stale: 0, noQuote: 0, ...NONE }),
    ).toEqual({
      message: "1 de 1 precio actualizado",
    });
    expect(
      priceSyncToast(es, { mapped: 1, updated: 0, stale: 1, noQuote: 0, ...NONE }),
    ).toEqual({
      message: "0 de 1 precio actualizado, 1 fallido",
      description: "1 con cotización caducada",
    });
  });

  it("counts the instruments without a symbol and says where to fix them", () => {
    expect(
      priceSyncToast(es, {
        mapped: 3,
        updated: 3,
        stale: 0,
        noQuote: 0,
        unmappedOpen: 2,
        unmappedClosed: 1,
      }),
    ).toEqual({
      message: "3 de 3 precios actualizados",
      description:
        "2 posiciones abiertas sin símbolo · 1 cerrada sin símbolo. Asígnalo en la columna Símbolo.",
    });
  });

  it("puts the failures first and the missing symbols after", () => {
    expect(
      priceSyncToast(es, {
        mapped: 2,
        updated: 1,
        stale: 1,
        noQuote: 0,
        unmappedOpen: 0,
        unmappedClosed: 1,
      }).description,
    ).toBe(
      "1 con cotización caducada. 1 cerrada sin símbolo. Asígnalo en la columna Símbolo.",
    );
  });

  it("still counts the missing symbols when nothing is mapped yet", () => {
    expect(
      priceSyncToast(es, {
        mapped: 0,
        updated: 0,
        stale: 0,
        noQuote: 0,
        unmappedOpen: 1,
        unmappedClosed: 0,
      }),
    ).toEqual({
      message: "Ningún instrumento tiene símbolo de cotización todavía.",
      description:
        "1 posición abierta sin símbolo. Asígnalo en la columna Símbolo.",
    });
  });
});
