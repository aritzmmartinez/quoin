import { describe, expect, it } from "vitest";

import type { FxRate } from "../ports";
import {
  bookingRate,
  rateBookFrom,
  valuationRate,
  VALUATION_RATE_MAX_AGE_DAYS,
} from "./rates";

const usd = (day: string, rate = "1.1"): FxRate => ({
  source: "ECB",
  base: "EUR",
  quote: "USD",
  day,
  rate,
});

// Easter 2026: Good Friday is 3 April, Easter Monday 6 April, both TARGET
// closing days, so the ECB publishes on Thursday 2 April and again on Tuesday 7.
const EASTER = rateBookFrom([usd("2026-04-02", "1.08"), usd("2026-04-07")]);

describe("rateBookFrom", () => {
  it("sorts each currency by day, whatever order the rates arrive in", () => {
    const book = rateBookFrom([usd("2026-04-07"), usd("2026-04-02")]);
    expect(book.get("USD")?.map((r) => r.day)).toEqual([
      "2026-04-02",
      "2026-04-07",
    ]);
  });

  it("refuses a rate against another base", () => {
    expect(() => rateBookFrom([{ ...usd("2026-04-02"), base: "USD" }])).toThrow(
      /against EUR/,
    );
  });

  it("refuses two rates for one currency on one day", () => {
    expect(() =>
      rateBookFrom([usd("2026-04-02"), usd("2026-04-02", "1.2")]),
    ).toThrow(/Two rates for USD/);
  });
});

describe("bookingRate, for a ledger row", () => {
  it("takes the rate of the row's own day", () => {
    expect(bookingRate(EASTER, "USD", "2026-04-02")?.rate).toBe("1.08");
  });

  it("takes the last TARGET day's rate for a closing day or a weekend", () => {
    expect(bookingRate(EASTER, "USD", "2026-04-03")?.day).toBe("2026-04-02");
    expect(bookingRate(EASTER, "USD", "2026-04-04")?.day).toBe("2026-04-02");
    expect(bookingRate(EASTER, "USD", "2026-04-06")?.day).toBe("2026-04-02");
  });

  it("answers nothing when that day's rate is not stored, never an older one", () => {
    const book = rateBookFrom([usd("2026-04-07")]);
    expect(bookingRate(book, "USD", "2026-04-08")).toBeNull();
  });

  it("answers nothing for a currency with no series", () => {
    expect(bookingRate(EASTER, "GBP", "2026-04-02")).toBeNull();
  });
});

describe("valuationRate, for a price", () => {
  it("takes the last rate published on or before the day", () => {
    expect(valuationRate(EASTER, "USD", "2026-04-06")?.day).toBe("2026-04-02");
  });

  it("takes yesterday's rate today, before the ECB publishes at 16:00", () => {
    expect(valuationRate(EASTER, "USD", "2026-04-08")?.day).toBe("2026-04-07");
  });

  it("is where the two rules part: a day whose rate is missing", () => {
    expect(bookingRate(EASTER, "USD", "2026-04-08")).toBeNull();
    expect(valuationRate(EASTER, "USD", "2026-04-08")).not.toBeNull();
  });

  it("accepts a rate exactly a week old and refuses an older one", () => {
    expect(VALUATION_RATE_MAX_AGE_DAYS).toBe(7);
    expect(valuationRate(EASTER, "USD", "2026-04-14")?.day).toBe("2026-04-07");
    expect(valuationRate(EASTER, "USD", "2026-04-15")).toBeNull();
  });

  it("never reaches forward to a later rate", () => {
    expect(valuationRate(EASTER, "USD", "2026-04-01")).toBeNull();
  });

  it("answers nothing for a currency with no series", () => {
    expect(valuationRate(EASTER, "GBP", "2026-04-02")).toBeNull();
  });
});
