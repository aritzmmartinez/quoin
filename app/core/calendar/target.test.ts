import { describe, it, expect } from "vitest";

import { easterSunday, isTargetBusinessDay, rateDayFor } from "./target";

describe("easterSunday", () => {
  it.each([
    [2000, "2000-04-23"],
    [2019, "2019-04-21"],
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
    [2038, "2038-04-25"],
  ])("falls in %i on %s", (year, day) => {
    expect(easterSunday(year)).toBe(day);
  });
});

describe("isTargetBusinessDay", () => {
  it.each([
    ["2026-01-01", "New Year's Day"],
    ["2026-04-03", "Good Friday"],
    ["2026-04-06", "Easter Monday"],
    ["2027-03-26", "Good Friday, in March"],
    ["2027-03-29", "Easter Monday, in March"],
    ["2026-05-01", "Labour Day"],
    ["2026-12-25", "Christmas Day"],
    ["2026-12-26", "Boxing Day, on a Saturday"],
    ["2026-10-17", "a Saturday"],
    ["2026-10-18", "a Sunday"],
  ])("closes on %s (%s)", (day) => {
    expect(isTargetBusinessDay(day)).toBe(false);
  });

  it.each([
    ["2026-12-24", "Christmas Eve"],
    ["2026-12-31", "New Year's Eve"],
    ["2026-04-02", "Maundy Thursday"],
    ["2026-04-07", "the Tuesday after Easter"],
    ["2026-10-16", "a Friday"],
    ["2027-12-27", "the Monday after a Christmas weekend"],
  ])("opens on %s (%s)", (day) => {
    expect(isTargetBusinessDay(day)).toBe(true);
  });
});

describe("rateDayFor", () => {
  it("keeps a business day as its own rate day", () => {
    expect(rateDayFor("2026-10-16")).toBe("2026-10-16");
  });

  it("takes Friday's rate on a weekend", () => {
    expect(rateDayFor("2026-10-17")).toBe("2026-10-16");
    expect(rateDayFor("2026-10-18")).toBe("2026-10-16");
  });

  it("goes back to Maundy Thursday across Easter", () => {
    const easter = ["2026-04-03", "2026-04-04", "2026-04-05", "2026-04-06"];
    for (const day of easter) {
      expect(rateDayFor(day)).toBe("2026-04-02");
    }
  });

  it("goes back to Christmas Eve across a Christmas weekend", () => {
    expect(rateDayFor("2026-12-27")).toBe("2026-12-24");
  });

  it("crosses into the previous year on New Year's Day", () => {
    expect(rateDayFor("2027-01-01")).toBe("2026-12-31");
  });

  it("takes Thursday's rate when Labour Day falls on a Friday", () => {
    expect(rateDayFor("2026-05-03")).toBe("2026-04-30");
  });
});
