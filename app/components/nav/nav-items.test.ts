import { describe, expect, it } from "vitest";

import { es } from "~/lib";

import { navItems, navItemFor } from "./nav-items";

const SUBPAGE_PARENTS: Record<string, string> = {
  "/realized": "/",
  "/opportunity-cost": "/",
  "/ter-cost": "/",
  "/instrument/:instrumentId": "/portfolio",
};

describe("navItemFor", () => {
  it("resolves every declared subpage parent to a sidebar item", () => {
    for (const [subpage, parent] of Object.entries(SUBPAGE_PARENTS)) {
      expect(navItemFor(es, parent), subpage).toBeDefined();
    }
  });

  it("returns undefined for a path that is not a sidebar item", () => {
    expect(navItemFor(es, "/portfolio/")).toBeUndefined();
    expect(navItemFor(es, undefined)).toBeUndefined();
  });

  it("has one sidebar item per path", () => {
    const paths = navItems(es).map((item) => item.to);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
