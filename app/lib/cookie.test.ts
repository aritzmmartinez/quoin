import { describe, expect, it } from "vitest";

import { readCookie } from "./cookie";

describe("readCookie", () => {
  it("returns the decoded value of the named cookie only", () => {
    expect(readCookie("a=1; quoin-x=EURUSD%3DX; b=2", "quoin-x")).toBe(
      "EURUSD=X",
    );
  });

  it("matches the whole name, not a suffix of another", () => {
    expect(readCookie("xquoin-x=1", "quoin-x")).toBeNull();
  });

  it("returns null when absent or not valid percent-encoding", () => {
    expect(readCookie(null, "quoin-x")).toBeNull();
    expect(readCookie("", "quoin-x")).toBeNull();
    expect(readCookie("quoin-x=%E0%A4%A", "quoin-x")).toBeNull();
  });
});
