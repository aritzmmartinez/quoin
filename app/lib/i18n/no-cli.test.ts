import { describe, expect, it } from "vitest";

import { en } from "./en";
import { es } from "./es";

function texts(value: unknown, path: string): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (typeof value === "function") {
    const args = Array.from({ length: value.length }, () => "X");
    try {
      return texts((value as (...a: unknown[]) => unknown)(...args), path);
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => texts(item, `${path}.${i}`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      texts(item, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

describe("copy", () => {
  it.each([
    ["es", es],
    ["en", en],
  ])("never sends the reader to a command in %s: the image carries none", (_l, copy) => {
    const offenders = texts(copy, "")
      .filter(([, text]) => /\bpnpm\b/.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it("reads every string, functions included", () => {
    const paths = texts(es, "").map(([path]) => path);
    expect(paths).toContain("basis.sync.rebase");
    expect(paths).toContain("currency.unresolvedFix");
  });
});
