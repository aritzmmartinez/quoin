import { describe, expect, it } from "vitest";

import {
  addCalendarMonths,
  calendarDate,
  compareCalendarDates,
  isAfter,
  isBefore,
  isWithin,
  parseIsoDate,
  toCalendarDate,
  toIsoDate,
} from "./calendar-date";

const MADRID = "Europe/Madrid";

function shift(iso: string, n: number): string {
  return toIsoDate(addCalendarMonths(parseIsoDate(iso), n));
}

function inMadrid(instant: string): string {
  return toIsoDate(toCalendarDate(new Date(instant), MADRID));
}

describe("calendarDate", () => {
  it("refuses a day the month does not have", () => {
    expect(() => calendarDate(2025, 2, 29)).toThrow(RangeError);
    expect(() => calendarDate(2025, 4, 31)).toThrow(RangeError);
    expect(() => calendarDate(2025, 13, 1)).toThrow(RangeError);
    expect(() => calendarDate(2025, 0, 1)).toThrow(RangeError);
    expect(calendarDate(2024, 2, 29)).toEqual({
      year: 2024,
      month: 2,
      day: 29,
    });
  });

  it("round-trips through YYYY-MM-DD", () => {
    expect(toIsoDate(calendarDate(2025, 3, 7))).toBe("2025-03-07");
    expect(parseIsoDate("2025-03-07")).toEqual(calendarDate(2025, 3, 7));
    expect(() => parseIsoDate("2025-3-7")).toThrow(RangeError);
    expect(() => parseIsoDate("2025-02-30")).toThrow(RangeError);
  });
});

describe("addCalendarMonths — date to date, clamped to the month's end (CC art. 5.1)", () => {
  it("30 April", () => {
    expect(shift("2025-04-30", -2)).toBe("2025-02-28");
    expect(shift("2025-04-30", 2)).toBe("2025-06-30");
  });

  it("31 December, across the year in both directions", () => {
    expect(shift("2025-12-31", 2)).toBe("2026-02-28");
    expect(shift("2025-12-31", -2)).toBe("2025-10-31");
  });

  it("31 August", () => {
    expect(shift("2025-08-31", 2)).toBe("2025-10-31");
    expect(shift("2025-08-31", -2)).toBe("2025-06-30");
  });

  it("29 February of a leap year", () => {
    expect(shift("2024-02-29", 2)).toBe("2024-04-29");
    expect(shift("2024-02-29", -2)).toBe("2023-12-29");
    expect(shift("2024-02-29", 12)).toBe("2025-02-28");
    expect(shift("2024-02-29", -12)).toBe("2023-02-28");
    expect(shift("2024-02-29", 48)).toBe("2028-02-29");
  });

  it("29 April lands on 29 February only in a leap year", () => {
    expect(shift("2024-04-29", -2)).toBe("2024-02-29");
    expect(shift("2025-04-29", -2)).toBe("2025-02-28");
    expect(shift("2024-04-30", -2)).toBe("2024-02-29");
  });

  it("crosses a year boundary backwards", () => {
    expect(shift("2025-01-15", -2)).toBe("2024-11-15");
    expect(shift("2025-02-28", -14)).toBe("2023-12-28");
  });

  it("zero months is the same date", () => {
    expect(shift("2025-04-30", 0)).toBe("2025-04-30");
  });

  it("is not invertible once a day was clamped", () => {
    expect(shift(shift("2025-04-30", -2), 2)).toBe("2025-04-28");
    expect(shift(shift("2025-12-31", 2), -2)).toBe("2025-12-28");
  });

  it("refuses a fractional month count", () => {
    expect(() => addCalendarMonths(calendarDate(2025, 1, 1), 1.5)).toThrow(
      RangeError,
    );
  });
});

describe("toCalendarDate", () => {
  it("reads the day in the zone it is given, not the machine's", () => {
    const instant = new Date("2025-12-31T23:30:00Z");
    expect(toIsoDate(toCalendarDate(instant, "UTC"))).toBe("2025-12-31");
    expect(toIsoDate(toCalendarDate(instant, MADRID))).toBe("2026-01-01");
  });

  it("winter: Madrid is UTC+1, the day turns at 23:00Z", () => {
    expect(inMadrid("2025-01-15T22:59:59.999Z")).toBe("2025-01-15");
    expect(inMadrid("2025-01-15T23:00:00Z")).toBe("2025-01-16");
  });

  it("summer: Madrid is UTC+2, the day turns at 22:00Z", () => {
    expect(inMadrid("2025-07-15T21:59:59.999Z")).toBe("2025-07-15");
    expect(inMadrid("2025-07-15T22:00:00Z")).toBe("2025-07-16");
    expect(inMadrid("2025-04-30T22:30:00Z")).toBe("2025-05-01");
  });

  it("around the March switch (2025-03-30, 01:00Z)", () => {
    expect(inMadrid("2025-03-29T22:59:00Z")).toBe("2025-03-29");
    expect(inMadrid("2025-03-29T23:00:00Z")).toBe("2025-03-30");
    expect(inMadrid("2025-03-30T00:59:00Z")).toBe("2025-03-30");
    expect(inMadrid("2025-03-30T01:00:00Z")).toBe("2025-03-30");
    // The same evening, the day now turns an hour earlier.
    expect(inMadrid("2025-03-30T21:59:00Z")).toBe("2025-03-30");
    expect(inMadrid("2025-03-30T22:00:00Z")).toBe("2025-03-31");
  });

  it("around the October switch (2025-10-26, 01:00Z)", () => {
    expect(inMadrid("2025-10-25T21:59:00Z")).toBe("2025-10-25");
    expect(inMadrid("2025-10-25T22:00:00Z")).toBe("2025-10-26");
    expect(inMadrid("2025-10-26T00:30:00Z")).toBe("2025-10-26");
    expect(inMadrid("2025-10-26T01:30:00Z")).toBe("2025-10-26");
    // The same evening, the day now turns an hour later.
    expect(inMadrid("2025-10-26T22:59:00Z")).toBe("2025-10-26");
    expect(inMadrid("2025-10-26T23:00:00Z")).toBe("2025-10-27");
  });

  it("refuses an invalid instant and an unknown zone", () => {
    expect(() => toCalendarDate(new Date("nope"), MADRID)).toThrow(RangeError);
    expect(() => toCalendarDate(new Date(), "Europe/Atlantis")).toThrow(
      RangeError,
    );
  });
});

describe("comparisons", () => {
  const a = calendarDate(2025, 2, 28);
  const b = calendarDate(2025, 3, 1);

  it("orders by year, then month, then day", () => {
    expect(compareCalendarDates(a, b)).toBeLessThan(0);
    expect(compareCalendarDates(b, a)).toBeGreaterThan(0);
    expect(compareCalendarDates(a, calendarDate(2025, 2, 28))).toBe(0);
    expect(isBefore(a, b)).toBe(true);
    expect(isAfter(b, a)).toBe(true);
    expect(isBefore(a, a)).toBe(false);
  });

  it("isWithin includes both bounds", () => {
    expect(isWithin(a, a, b)).toBe(true);
    expect(isWithin(b, a, b)).toBe(true);
    expect(isWithin(calendarDate(2025, 2, 27), a, b)).toBe(false);
    expect(isWithin(calendarDate(2025, 3, 2), a, b)).toBe(false);
  });
});
