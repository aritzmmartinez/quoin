import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { classifyDatabaseIn } from "./database-target";

describe("classifyDatabaseIn", () => {
  const root = resolve("/elsewhere/quoin");

  it("resolves a relative URL against the given root", () => {
    expect(classifyDatabaseIn("file:./data/dev.sqlite", root)).toEqual({
      kind: "scratch",
      path: resolve(root, "data/dev.sqlite"),
    });
    expect(classifyDatabaseIn("file:./data/quoin.sqlite", root).kind).toBe(
      "ledger",
    );
  });

  it("does not call another root's ledger the ledger", () => {
    const other = resolve("/somewhere/else/data/quoin.sqlite");
    expect(classifyDatabaseIn(`file:${other}`, root)).toEqual({
      kind: "other",
      path: other,
    });
  });
});
