import { describe, expect, it } from "vitest";

import { describeListener, isPortInUse } from "./sync-notice";

const scratch = { kind: "scratch", path: "/q/data/dev.sqlite" } as const;
const ledger = { kind: "ledger", path: "/q/data/quoin.sqlite" } as const;

describe("describeListener", () => {
  it("names the port and the database it serves", () => {
    expect(describeListener("listening", 3443, scratch, true)).toBe(
      "quoin sync: listening on port 3443 — Database: /q/data/dev.sqlite (scratch database)",
    );
  });

  it("shouts the ledger like every script does", () => {
    expect(describeListener("listening", 3443, ledger, false)).toBe(
      "quoin sync: listening on port 3443 — Database: /q/data/quoin.sqlite (LIVE LEDGER, real trades)",
    );
  });

  it("suggests another dev server only in development", () => {
    expect(describeListener("port-in-use", 3443, scratch, true)).toBe(
      "quoin sync: port 3443 is in use by another process (another pnpm dev?); " +
        "not listening — Database: /q/data/dev.sqlite (scratch database)",
    );
    expect(describeListener("port-in-use", 3443, ledger, false)).toBe(
      "quoin sync: port 3443 is in use by another process; " +
        "not listening — Database: /q/data/quoin.sqlite (LIVE LEDGER, real trades)",
    );
  });
});

describe("isPortInUse", () => {
  it("recognises EADDRINUSE and nothing else", () => {
    expect(
      isPortInUse(Object.assign(new Error("x"), { code: "EADDRINUSE" })),
    ).toBe(true);
    expect(isPortInUse(Object.assign(new Error("x"), { code: "EACCES" }))).toBe(
      false,
    );
    expect(isPortInUse(null)).toBe(false);
    expect(isPortInUse("EADDRINUSE")).toBe(false);
  });
});
