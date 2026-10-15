import { describe, expect, it } from "vitest";

import { dayOf, shiftDay } from "./day";

describe("dayOf — the Madrid calendar day", () => {
  it("winter: Madrid is UTC+1", () => {
    expect(dayOf(new Date("2026-03-28T22:59:59Z"))).toBe("2026-03-28");
    expect(dayOf(new Date("2026-03-28T23:00:00Z"))).toBe("2026-03-29");
  });

  it("summer: Madrid is UTC+2, across the March switch", () => {
    expect(dayOf(new Date("2026-03-29T21:59:59Z"))).toBe("2026-03-29");
    expect(dayOf(new Date("2026-03-29T22:00:00Z"))).toBe("2026-03-30");
  });

  it("across the October switch back to UTC+1", () => {
    expect(dayOf(new Date("2026-10-24T21:59:59Z"))).toBe("2026-10-24");
    expect(dayOf(new Date("2026-10-24T22:00:00Z"))).toBe("2026-10-25");
    expect(dayOf(new Date("2026-10-25T22:59:59Z"))).toBe("2026-10-25");
    expect(dayOf(new Date("2026-10-25T23:00:00Z"))).toBe("2026-10-26");
  });

  it("New Year's Eve after 23:00 UTC is already next year", () => {
    expect(dayOf(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });
});

describe("shiftDay", () => {
  it("crosses month, year and leap-day boundaries", () => {
    expect(shiftDay("2026-10-01", -1)).toBe("2026-09-30");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2028-03-01", -1)).toBe("2028-02-29");
    expect(shiftDay("2026-10-14", -7)).toBe("2026-10-07");
  });

  it("is unaffected by the DST switch, being calendar arithmetic", () => {
    expect(shiftDay("2026-03-30", -1)).toBe("2026-03-29");
    expect(shiftDay("2026-10-26", -1)).toBe("2026-10-25");
  });
});
