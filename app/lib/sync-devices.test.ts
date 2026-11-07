import { describe, expect, it } from "vitest";

import { en } from "./i18n/en";
import {
  formatCountdown,
  pairingPayload,
  parseHost,
  parsePort,
  parseServerName,
  proposeHosts,
  summarizeLastSync,
} from "./sync-devices";

const iface = (address: string, internal = false, family = "IPv4") => ({
  address,
  internal,
  family,
});

describe("parseHost", () => {
  it.each([
    "192.168.1.20",
    "10.0.0.1",
    "quoin-pc",
    "quoin.local",
    " 10.0.0.1 ",
  ])("accepts %s", (host) => {
    expect(parseHost(host)).toBe(host.trim());
  });

  it.each([
    "",
    "999.1.1.1",
    "192.168.1",
    "https://x",
    "a b",
    "-x",
    "::1",
    "x/y",
  ])("refuses %j", (host) => {
    expect(parseHost(host)).toBeNull();
  });
});

describe("parsePort", () => {
  it.each([
    ["1", 1],
    ["3443", 3443],
    ["65535", 65535],
  ])("accepts %s", (raw, port) => {
    expect(parsePort(raw)).toBe(port);
  });

  it.each(["", "0", "65536", "34.5", "-1", "abc", "1e3"])(
    "refuses %j",
    (raw) => {
      expect(parsePort(raw)).toBeNull();
    },
  );
});

describe("parseServerName", () => {
  it("trims, and treats an empty name as no name", () => {
    expect(parseServerName("  Salón ")).toBe("Salón");
    expect(parseServerName("   ")).toBeNull();
  });

  it("refuses one over the limit", () => {
    expect(parseServerName("x".repeat(100))).toBe("x".repeat(100));
    expect(parseServerName("x".repeat(101))).toBeUndefined();
  });
});

describe("proposeHosts", () => {
  it("outside Docker offers this computer's addresses, the likeliest LAN first", () => {
    expect(
      proposeHosts({
        docker: false,
        browserHost: "localhost",
        interfaces: {
          lo: [iface("127.0.0.1", true)],
          wsl: [iface("172.20.0.1")],
          tunnel: [iface("100.64.0.1")],
          office: [iface("10.0.0.5")],
          wifi: [iface("192.168.1.20"), iface("fe80::1", false, "IPv6")],
          nothing: [iface("169.254.3.3")],
          gone: undefined,
        },
      }),
    ).toEqual(["192.168.1.20", "10.0.0.5", "172.20.0.1", "100.64.0.1"]);
  });

  it("in Docker ignores the container's own interfaces and takes the browser's address", () => {
    expect(
      proposeHosts({
        docker: true,
        browserHost: "192.168.1.20",
        interfaces: { eth0: [iface("172.17.0.2")] },
      }),
    ).toEqual(["192.168.1.20"]);
  });

  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "in Docker proposes nothing from a browser on %s",
    (browserHost) => {
      expect(
        proposeHosts({ docker: true, browserHost, interfaces: {} }),
      ).toEqual([]);
    },
  );
});

describe("pairingPayload", () => {
  it("states exactly what the phone reads", () => {
    expect(
      JSON.parse(
        pairingPayload({
          host: "192.168.1.20",
          port: 3443,
          sha256: "ab",
          token: "t",
          name: "PC",
        }),
      ),
    ).toEqual({
      v: 1,
      host: "192.168.1.20",
      port: 3443,
      sha256: "ab",
      token: "t",
      name: "PC",
    });
  });
});

describe("formatCountdown", () => {
  it.each([
    [120_000, "2:00"],
    [61_000, "1:01"],
    [59_001, "1:00"],
    [9_000, "0:09"],
    [0, "0:00"],
    [-5_000, "0:00"],
  ])("%d ms is %s", (ms, text) => {
    expect(formatCountdown(ms)).toBe(text);
  });
});

describe("summarizeLastSync", () => {
  const copy = en.settings.devices.counts;

  it("adds what is new to what changed, per kind", () => {
    expect(
      summarizeLastSync(
        JSON.stringify({
          ledger: 2,
          inKind: 1,
          newInstruments: 1,
          changedInstruments: 1,
          newTargets: 1,
          newHoldings: 1,
          replacedHoldings: 2,
          updatedIdentities: 1,
          settings: true,
          setAside: 1,
          restamped: 9,
        }),
        copy,
      ).changes,
    ).toEqual([
      "3 transactions",
      "2 instruments",
      "1 plan",
      "3 compositions",
      "1 identity",
      "the residence",
      "1 transaction set aside",
    ]);
  });

  it("says no changes when nothing moved, and carries the failures apart", () => {
    expect(
      summarizeLastSync('{"ledger":0,"failedPrices":2,"failedRates":1}', copy),
    ).toEqual({ changes: ["No changes"], failedPrices: 2, failedRates: 1 });
  });

  it.each([null, "not json", "[]", '{"ledger":"many"}'])(
    "survives a stored value it cannot read: %j",
    (raw) => {
      expect(summarizeLastSync(raw, copy)).toEqual({
        changes: ["No changes"],
        failedPrices: 0,
        failedRates: 0,
      });
    },
  );
});
