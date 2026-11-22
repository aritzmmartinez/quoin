import { describe, expect, it } from "vitest";

import {
  decideRequest,
  isAllowedHost,
  parseAllowedHosts,
  type RequestHeaders,
} from "./request-guard";

const none = new Set<string>();

const request = (overrides: Partial<RequestHeaders>): RequestHeaders => ({
  method: "GET",
  host: "localhost:3000",
  secFetchSite: null,
  origin: null,
  ...overrides,
});

describe("isAllowedHost", () => {
  it.each([
    "localhost",
    "localhost:3000",
    "LOCALHOST:5173",
    "127.0.0.1:3000",
    "192.168.1.20:3000",
    "10.0.0.5",
    "[::1]:3000",
    "[::1]",
    "[fe80::1]:8080",
  ])("allows %s with no list", (host) => {
    expect(isAllowedHost(host, none)).toBe(true);
  });

  it.each([
    "evil.com",
    "evil.com:3000",
    "localhost.",
    "localhost.evil.com",
    "127.0.0.1.nip.io",
    "nas.local:3000",
    "",
    "evil.com@127.0.0.1",
    "127.0.0.1/path",
    "[::1",
  ])("refuses %s with no list", (host) => {
    expect(isAllowedHost(host, none)).toBe(false);
  });

  it("refuses a request without a Host", () => {
    expect(isAllowedHost(null, none)).toBe(false);
  });

  it("allows a listed name on any port, and only that name", () => {
    const allowed = parseAllowedHosts(" NAS.local , quoin.example.org:443,,");
    expect([...allowed]).toEqual(["nas.local", "quoin.example.org"]);
    expect(isAllowedHost("nas.local:3000", allowed)).toBe(true);
    expect(isAllowedHost("quoin.example.org", allowed)).toBe(true);
    expect(isAllowedHost("other.local:3000", allowed)).toBe(false);
    expect(isAllowedHost("nas.local.", allowed)).toBe(false);
  });

  it("reads an unset variable as no names", () => {
    expect(parseAllowedHosts(undefined).size).toBe(0);
  });
});

describe("decideRequest", () => {
  it("refuses an unknown host on every method, reads included", () => {
    for (const method of ["GET", "HEAD", "POST"]) {
      expect(decideRequest(request({ method, host: "evil.com:3000" }), none)).toEqual({
        ok: false,
        reason: "forbidden-host",
      });
    }
  });

  it("lets a read through whatever site it comes from", () => {
    expect(decideRequest(request({ secFetchSite: "cross-site" }), none)).toEqual({ ok: true });
  });

  it.each(["cross-site", "same-site"])("refuses a write marked %s", (site) => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
      expect(decideRequest(request({ method, secFetchSite: site }), none)).toEqual({
        ok: false,
        reason: "cross-site",
      });
    }
  });

  it.each(["same-origin", "none"])("allows a write marked %s", (site) => {
    expect(
      decideRequest(
        request({ method: "POST", secFetchSite: site, origin: "http://evil.com" }),
        none,
      ),
    ).toEqual({ ok: true });
  });

  describe("without Sec-Fetch-Site", () => {
    const post = (origin: string | null, host = "localhost:3000") =>
      decideRequest(request({ method: "POST", origin, host }), none);

    it("allows a write with no Origin either, as curl sends", () => {
      expect(post(null)).toEqual({ ok: true });
    });

    it("allows a write whose Origin is the host", () => {
      expect(post("http://localhost:3000")).toEqual({ ok: true });
      expect(post("http://[::1]:3000", "[::1]:3000")).toEqual({ ok: true });
      expect(post("https://192.168.1.20", "192.168.1.20")).toEqual({ ok: true });
    });

    it.each([
      "http://evil.com",
      "http://localhost:5173",
      "http://127.0.0.1:3000",
      "null",
      "not a url",
    ])("refuses a write from Origin %s", (origin) => {
      expect(post(origin)).toEqual({ ok: false, reason: "cross-site" });
    });
  });
});
