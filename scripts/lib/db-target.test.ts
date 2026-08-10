import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assertScratchDatabase,
  databasePath,
  isRealDatabase,
  isScratchDatabase,
  PROJECT_ROOT,
  REAL_DATABASE_FILE,
  realDatabasePath,
  SCRATCH_DATABASE_FILE,
  scratchDatabasePath,
} from "./db-target";

/**
 * The guard that stands between an agent session and fourteen months of trades.
 * It is worth more tests than its size suggests: every branch here is the one that
 * has to hold when everything else has already gone wrong.
 */

const SCRATCH = "file:./data/dev.sqlite";

/** Sessions run with DATABASE_URL already set, so tests of the fallback must clear it. */
function withoutDatabaseUrl(): void {
  const original = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });
}

describe("databasePath", () => {
  it("resolves a relative file: URL from the project root, not from prisma/", () => {
    expect(databasePath("file:./data/dev.sqlite")).toBe(
      resolve(PROJECT_ROOT, "data/dev.sqlite"),
    );
  });

  it("resolves a bare relative path with no leading ./", () => {
    expect(databasePath("file:data/dev.sqlite")).toBe(
      resolve(PROJECT_ROOT, "data/dev.sqlite"),
    );
  });

  it.each([
    ["empty", ""],
    ["an in-memory database", "file::memory:"],
    ["an empty file: URL", "file:"],
    ["a non-file datasource", "postgresql://localhost:5432/quoin"],
    ["a malformed value", "quoin.sqlite"],
  ])("returns null for %s", (_label, url) => {
    expect(databasePath(url)).toBeNull();
  });

  describe("with no argument", () => {
    withoutDatabaseUrl();

    it("falls back to DATABASE_URL", () => {
      process.env.DATABASE_URL = "file:./data/dev.sqlite";
      expect(databasePath()).toBe(resolve(PROJECT_ROOT, "data/dev.sqlite"));
    });

    it("returns null when DATABASE_URL is unset", () => {
      expect(databasePath()).toBeNull();
    });
  });
});

describe("isRealDatabase", () => {
  it("recognises the live ledger", () => {
    expect(isRealDatabase(realDatabasePath())).toBe(true);
  });

  it("does not mistake the scratch database for it", () => {
    expect(isRealDatabase(resolve(PROJECT_ROOT, "data/dev.sqlite"))).toBe(false);
  });

  it("is not fooled by a path that merely ends the same way", () => {
    expect(
      isRealDatabase(resolve(PROJECT_ROOT, "data/backups/quoin.sqlite")),
    ).toBe(false);
  });

  it("compares case-insensitively on Windows, where the two are one file", () => {
    // Same assertion both ways round: on POSIX a case-shifted path IS another file.
    expect(isRealDatabase(realDatabasePath().toUpperCase())).toBe(
      process.platform === "win32",
    );
  });
});

describe("isScratchDatabase", () => {
  it("recognises the scratch database", () => {
    expect(isScratchDatabase(scratchDatabasePath())).toBe(true);
  });

  it("does not confuse it with the live ledger", () => {
    expect(isScratchDatabase(realDatabasePath())).toBe(false);
    expect(isRealDatabase(scratchDatabasePath())).toBe(false);
  });
});

describe("assertScratchDatabase", () => {
  withoutDatabaseUrl();

  it("returns the resolved target for the scratch database", () => {
    process.env.DATABASE_URL = SCRATCH;
    expect(assertScratchDatabase("seed")).toBe(scratchDatabasePath());
  });

  it("accepts the scratch database spelled as an absolute path", () => {
    process.env.DATABASE_URL = `file:${scratchDatabasePath()}`;
    expect(assertScratchDatabase("seed")).toBe(scratchDatabasePath());
  });

  it("refuses when DATABASE_URL points at the live ledger", () => {
    process.env.DATABASE_URL = `file:./${REAL_DATABASE_FILE}`;
    expect(() => assertScratchDatabase("seed")).toThrow(/live ledger/);
  });

  it("refuses an absolute URL that reaches the live ledger by another spelling", () => {
    process.env.DATABASE_URL = `file:${resolve(PROJECT_ROOT, "./data/../data/quoin.sqlite")}`;
    expect(() => assertScratchDatabase("seed")).toThrow(/live ledger/);
  });

  // The whole reason this is an allow-list. A "not the ledger" check passes every one
  // of these, and each is a file nobody chose to destroy.
  it.each([
    ["a backup of the ledger", "file:./data/backups/quoin-20260809-2233.sqlite"],
    ["a near-miss typo", "file:./data/quoin.sqlit"],
    ["a plausible sibling", "file:./data/quoin-old.sqlite"],
    ["somewhere else entirely", "file:./data/production.sqlite"],
    ["the demo database it replaced", "file:./data/demo.sqlite"],
  ])("refuses %s, which is not the ledger but is not scratch either", (_l, url) => {
    process.env.DATABASE_URL = url;
    expect(() => assertScratchDatabase("seed")).toThrow(
      /is not the scratch database/,
    );
  });

  // Fails closed: "cannot tell" must never read as "safe".
  it.each([
    ["unset", undefined],
    ["in-memory", "file::memory:"],
    ["a remote datasource", "postgresql://localhost:5432/quoin"],
  ])("refuses when DATABASE_URL is %s", (_label, url) => {
    if (url !== undefined) process.env.DATABASE_URL = url;
    expect(() => assertScratchDatabase("seed")).toThrow(
      /does not resolve to a local SQLite file/,
    );
  });

  it("names the action it refused, so the message says what was stopped", () => {
    process.env.DATABASE_URL = `file:./${REAL_DATABASE_FILE}`;
    expect(() => assertScratchDatabase("reset the database")).toThrow(
      /Refusing to reset the database/,
    );
  });

  it("points at the scratch database in every refusal, so the fix is in the error", () => {
    for (const url of [undefined, "file:./data/quoin.sqlite", "file:./data/other.sqlite"]) {
      if (url === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = url;

      expect(() => assertScratchDatabase("seed")).toThrow(SCRATCH_DATABASE_FILE);
    }
  });
});
