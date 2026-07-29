import { describe, expect, it } from "vitest";

import {
  PAGE_SIZE,
  pageCount,
  pageHref,
  paginate,
  parsePage,
} from "./pagination";

const range = (n: number): number[] =>
  Array.from({ length: n }, (_, i) => i + 1);

describe("pageCount", () => {
  it("rounds up partial pages", () => {
    expect(pageCount(0, 10)).toBe(1);
    expect(pageCount(1, 10)).toBe(1);
    expect(pageCount(10, 10)).toBe(1);
    expect(pageCount(11, 10)).toBe(2);
    expect(pageCount(20, 10)).toBe(2);
    expect(pageCount(21, 10)).toBe(3);
  });

  it("treats an empty list as a single empty page", () => {
    expect(pageCount(0)).toBe(1);
  });

  it("defaults to PAGE_SIZE", () => {
    expect(pageCount(PAGE_SIZE + 1)).toBe(2);
  });
});

describe("parsePage", () => {
  it("defaults to 1 when absent", () => {
    expect(parsePage(new URLSearchParams())).toBe(1);
  });

  it("reads a positive integer", () => {
    expect(parsePage(new URLSearchParams("page=3"))).toBe(3);
  });

  it.each(["", "abc", "0", "-1", "2.5", " ", "NaN", "Infinity"])(
    "falls back to 1 for %o",
    (value) => {
      expect(parsePage(new URLSearchParams([["page", value]]))).toBe(1);
    },
  );

  it("accepts exponent notation, since it is a real integer", () => {
    expect(parsePage(new URLSearchParams("page=1e3"))).toBe(1000);
  });
});

describe("paginate", () => {
  it("returns the first page by default", () => {
    const { items, info } = paginate(range(25), 1, 10);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(info).toEqual({ page: 1, pageCount: 3, from: 1, to: 10, total: 25 });
  });

  it("slices a middle page", () => {
    const { items, info } = paginate(range(25), 2, 10);
    expect(items).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(info).toMatchObject({ page: 2, from: 11, to: 20 });
  });

  it("reports a short final page correctly", () => {
    const { items, info } = paginate(range(25), 3, 10);
    expect(items).toEqual([21, 22, 23, 24, 25]);
    expect(info).toMatchObject({ page: 3, pageCount: 3, from: 21, to: 25 });
  });

  it("clamps a page past the end to the last page", () => {
    const { items, info } = paginate(range(25), 999, 10);
    expect(items).toEqual([21, 22, 23, 24, 25]);
    expect(info.page).toBe(3);
  });

  it("clamps a page below 1 to the first page", () => {
    const { info } = paginate(range(25), -4, 10);
    expect(info.page).toBe(1);
  });

  it("handles an empty list without inventing rows", () => {
    const { items, info } = paginate([], 1, 10);
    expect(items).toEqual([]);
    expect(info).toEqual({ page: 1, pageCount: 1, from: 0, to: 0, total: 0 });
  });

  it("handles a list that exactly fills its pages", () => {
    const { items, info } = paginate(range(20), 2, 10);
    expect(items).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(info).toMatchObject({ pageCount: 2, from: 11, to: 20 });
  });

  it("does not mutate the input", () => {
    const items = range(5);
    paginate(items, 1, 2);
    expect(items).toEqual([1, 2, 3, 4, 5]);
  });

  it("covers every item exactly once across all pages", () => {
    const items = range(97);
    const seen = Array.from(
      { length: pageCount(97, 10) },
      (_, i) => paginate(items, i + 1, 10).items,
    ).flat();
    expect(seen).toEqual(items);
  });
});

describe("pageHref", () => {
  it("preserves unrelated params", () => {
    const params = new URLSearchParams("sort=weight&dir=desc");
    expect(pageHref(params, 2)).toBe("?sort=weight&dir=desc&page=2");
  });

  it("replaces an existing page param", () => {
    const params = new URLSearchParams("page=4&range=6m");
    expect(pageHref(params, 5)).toBe("?page=5&range=6m");
  });

  it("drops the param for page 1 so the first page has one canonical URL", () => {
    const params = new URLSearchParams("page=3&sort=name");
    expect(pageHref(params, 1)).toBe("?sort=name");
  });

  it("does not mutate the params it is given", () => {
    const params = new URLSearchParams("page=2");
    pageHref(params, 7);
    expect(params.get("page")).toBe("2");
  });
});
