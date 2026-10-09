import { describe, expect, it } from "vitest";

import type { SymbolCheck } from "~/lib/symbol-check";

import {
  canRedownload,
  canSave,
  canVerify,
  checkRequest,
  initialMapper,
  isVerified,
  mapperReducer,
  type MapperEvent,
  type MapperState,
} from "./symbol-mapper";

const check = (symbol: string, currency = "EUR"): SymbolCheck => ({
  symbol,
  price: "100",
  currency,
  asOf: "2026-10-08T14:00:00.000Z",
  fresh: true,
  quantity: "2",
  impliedValue: "200",
  closed: false,
  foreignCurrency: currency === "EUR" ? null : currency,
  name: "Synthetic Fund",
  trades: [],
  tradesAsked: 0,
  tradesOff: false,
});

const run = (state: MapperState, ...events: MapperEvent[]) =>
  events.reduce(mapperReducer, state);

const PLACES = [
  { place: "the import wizard", initial: "", stored: null },
  { place: "an Instruments row", initial: "OLD.DE", stored: "OLD.DE" },
] as const;

describe.each(PLACES)("symbol mapper in $place", ({ initial, stored }) => {
  it("only lets a verified symbol be saved", () => {
    const typed = run(initialMapper(initial), {
      type: "edit",
      symbol: " NEW.DE ",
    });
    expect(canVerify(typed)).toBe(true);
    expect(canSave(typed, stored)).toBe(false);

    const verifying = run(typed, { type: "verify" });
    expect(canVerify(verifying)).toBe(false);
    expect(checkRequest("XS00TEST0003", verifying)).toEqual({
      intent: "check",
      instrumentId: "XS00TEST0003",
      symbol: "NEW.DE",
    });

    const verified = run(verifying, {
      type: "verified",
      check: check("NEW.DE"),
    });
    expect(isVerified(verified)).toBe(true);
    expect(canSave(verified, stored)).toBe(true);

    const saving = run(verified, { type: "save" });
    expect(canSave(saving, stored)).toBe(false);
    expect(canSave(run(saving, { type: "saved" }), "NEW.DE")).toBe(false);
  });

  it("drops the check as soon as the symbol is edited", () => {
    const verified = run(
      initialMapper(initial),
      { type: "edit", symbol: "NEW.DE" },
      { type: "verify" },
      { type: "verified", check: check("NEW.DE") },
      { type: "edit", symbol: "NEW.MI" },
    );
    expect(isVerified(verified)).toBe(false);
    expect(canSave(verified, stored)).toBe(false);
  });

  it("does not verify a symbol edited while the check was in flight", () => {
    const late = run(
      initialMapper(initial),
      { type: "edit", symbol: "NEW.DE" },
      { type: "verify" },
      { type: "edit", symbol: "NEW.MI" },
      { type: "verified", check: check("NEW.DE") },
    );
    expect(isVerified(late)).toBe(false);
  });

  it("shows a failed check as an error and forgets the old check", () => {
    const failed = run(
      initialMapper(initial),
      { type: "edit", symbol: "NOPE" },
      { type: "verify" },
      { type: "failed", error: "no quote" },
    );
    expect(failed).toMatchObject({
      error: "no quote",
      check: null,
      busy: null,
    });
  });

  it("keeps the check when the save fails, so it can be retried", () => {
    const failed = run(
      initialMapper(initial),
      { type: "edit", symbol: "NEW.DE" },
      { type: "verify" },
      { type: "verified", check: check("NEW.DE") },
      { type: "save" },
      { type: "failed", error: "nope" },
    );
    expect(canSave(failed, stored)).toBe(true);
  });

  it("never offers to save the symbol already stored", () => {
    const same = run(
      initialMapper(initial),
      { type: "edit", symbol: "OLD.DE" },
      { type: "verify" },
      { type: "verified", check: check("OLD.DE") },
    );
    expect(canSave(same, "OLD.DE")).toBe(false);
  });

  it("verifies a quote outside euros but never lets it be saved", () => {
    const usd = run(
      initialMapper(initial),
      { type: "edit", symbol: "AAA" },
      { type: "verify" },
      { type: "verified", check: check("AAA", "USD") },
    );
    expect(isVerified(usd)).toBe(true);
    expect(usd.check?.foreignCurrency).toBe("USD");
    expect(canSave(usd, stored)).toBe(false);
  });

  it("does not verify an empty symbol", () => {
    const blank = run(initialMapper(initial), { type: "edit", symbol: " " });
    expect(canVerify(blank)).toBe(false);
  });
});

describe("change or download again, in an Instruments row", () => {
  const verified = (symbol: string) =>
    run(
      initialMapper("OLD.DE"),
      { type: "edit", symbol },
      { type: "verify" },
      { type: "verified", check: check(symbol) },
    );

  it("only lets a symbol other than the stored one be changed to", () => {
    const other = verified("NEW.DE");
    expect(canSave(other, "OLD.DE")).toBe(true);
    expect(canRedownload(other, "OLD.DE")).toBe(false);
  });

  it("only lets the stored symbol be downloaded again", () => {
    const same = run(initialMapper("OLD.DE"));
    expect(canRedownload(same, "OLD.DE")).toBe(true);
    expect(canSave(same, "OLD.DE")).toBe(false);
    expect(canSave(verified("OLD.DE"), "OLD.DE")).toBe(false);
  });

  it("downloads again only the stored symbol, never an edit still unsaved", () => {
    const typed = run(initialMapper("OLD.DE"), {
      type: "edit",
      symbol: "NEW.DE",
    });
    expect(canRedownload(typed, "OLD.DE")).toBe(false);
    expect(canSave(typed, "OLD.DE")).toBe(false);
  });

  it("has nothing to download again before any symbol is stored", () => {
    expect(canRedownload(run(initialMapper("")), null)).toBe(false);
  });

  it("waits while a check is in flight", () => {
    const checking = run(initialMapper("OLD.DE"), { type: "verify" });
    expect(canRedownload(checking, "OLD.DE")).toBe(false);
  });
});
