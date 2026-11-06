import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_TOKEN_ATTEMPTS,
  PAIRING_TTL_MS,
  pairingCode,
  PairingRegistry,
} from "./sync-pairing";

const NOW = 1_000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pairingCode", () => {
  it("is the first four bytes of the HMAC, modulo a million", () => {
    // printf dev-phone | openssl dgst -sha256 -hmac test-token → 877d42e8…
    // 0x877d42e8 = 2273133288
    expect(pairingCode("test-token", "dev-phone")).toBe("133288");
  });

  it("keeps its leading zeros", () => {
    const codes = Array.from({ length: 2000 }, (_, i) =>
      pairingCode("t", `d${i}`),
    );
    expect(codes.every((code) => /^\d{6}$/.test(code))).toBe(true);
    expect(codes.some((code) => code.startsWith("0"))).toBe(true);
  });
});

describe("PairingRegistry", () => {
  it("holds the phone until the computer confirms", async () => {
    const registry = new PairingRegistry();
    const { token, expiresAt } = registry.start(NOW);
    expect(expiresAt).toBe(NOW + PAIRING_TTL_MS);

    const answer = registry.request(token, "dev-phone", "Phone");
    expect(registry.state()).toMatchObject({
      status: "confirming",
      name: "Phone",
      code: pairingCode(token, "dev-phone"),
    });

    registry.confirm();
    await expect(answer).resolves.toEqual({
      kind: "confirmed",
      deviceId: "dev-phone",
      name: "Phone",
    });
    expect(registry.state()).toEqual({ status: "paired", name: "Phone" });
  });

  it("answers a rejection", async () => {
    const registry = new PairingRegistry();
    const answer = registry.request(registry.start(NOW).token, "d", "P");

    registry.reject();

    await expect(answer).resolves.toEqual({ kind: "rejected" });
    expect(registry.state()).toEqual({ status: "rejected" });
  });

  it("expires a token nobody used, and one left waiting for an answer", async () => {
    const registry = new PairingRegistry();
    registry.start(NOW);
    vi.advanceTimersByTime(PAIRING_TTL_MS);
    expect(registry.state()).toEqual({ status: "expired" });

    const answer = registry.request(registry.start(NOW).token, "d", "P");
    vi.advanceTimersByTime(PAIRING_TTL_MS);
    await expect(answer).resolves.toEqual({ kind: "expired" });
    expect(registry.state()).toEqual({ status: "expired" });
  });

  it("refuses a token used twice", async () => {
    const registry = new PairingRegistry();
    const { token } = registry.start(NOW);
    void registry.request(token, "d", "P");

    await expect(registry.request(token, "x", "Thief")).resolves.toEqual({
      kind: "invalid-token",
    });
    expect(registry.state()).toMatchObject({ status: "confirming", name: "P" });
  });

  it("refuses any token when nothing is under way", async () => {
    await expect(
      new PairingRegistry().request("any", "d", "P"),
    ).resolves.toEqual({ kind: "invalid-token" });
  });

  it("ends the session after too many wrong tokens", async () => {
    const registry = new PairingRegistry();
    registry.start(NOW);

    for (let i = 0; i < MAX_TOKEN_ATTEMPTS; i++) {
      await registry.request("wrong", "d", "P");
    }

    expect(registry.state()).toEqual({ status: "expired" });
  });

  it("drops the previous session when a new one starts", async () => {
    const registry = new PairingRegistry();
    const first = registry.start(NOW).token;
    const answer = registry.request(first, "d", "P");

    const second = registry.start(NOW).token;

    await expect(answer).resolves.toEqual({ kind: "expired" });
    expect(second).not.toBe(first);
    expect(registry.state().status).toBe("waiting");
  });

  it("does not confirm or reject when nobody asked", () => {
    const registry = new PairingRegistry();
    registry.start(NOW);
    registry.confirm();
    registry.reject();
    expect(registry.state().status).toBe("waiting");
  });
});
