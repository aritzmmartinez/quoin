import { describe, expect, it } from "vitest";

import { NAV_ITEMS, navItemFor } from "./nav-items";

const SUBPAGE_PARENTS: Record<string, string> = {
  "/realizado": "/",
  "/coste-oportunidad": "/",
  "/coste-ter": "/",
  "/instrument/:instrumentId": "/cartera",
};

describe("navItemFor", () => {
  it("resolves every declared subpage parent to a sidebar item", () => {
    for (const [subpage, parent] of Object.entries(SUBPAGE_PARENTS)) {
      expect(navItemFor(parent), subpage).toBeDefined();
    }
  });

  it("returns undefined for a path that is not a sidebar item", () => {
    expect(navItemFor("/cartera/")).toBeUndefined();
    expect(navItemFor(undefined)).toBeUndefined();
  });

  it("has one sidebar item per path", () => {
    const paths = NAV_ITEMS.map((item) => item.to);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
