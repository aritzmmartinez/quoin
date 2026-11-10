import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONFIRM_TTL_MS,
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

  it("expires a token nobody used", () => {
    const registry = new PairingRegistry();
    registry.start(NOW);
    vi.advanceTimersByTime(PAIRING_TTL_MS);
    expect(registry.state()).toEqual({ status: "expired" });
  });

  it("gives the confirmation its own time, counted from the scan", async () => {
    const registry = new PairingRegistry();
    const { token } = registry.start(NOW);
    vi.advanceTimersByTime(PAIRING_TTL_MS - 1_000);

    const answer = registry.request(token, "d", "P");
    vi.advanceTimersByTime(CONFIRM_TTL_MS - 1);
    expect(registry.state().status).toBe("confirming");

    vi.advanceTimersByTime(1);
    await expect(answer).resolves.toEqual({ kind: "expired" });
    expect(registry.state()).toEqual({ status: "expired" });
  });

  it("expires when the phone hangs up, so it cannot be confirmed later", async () => {
    const registry = new PairingRegistry();
    const phone = new AbortController();
    const answer = registry.request(
      registry.start(NOW).token,
      "d",
      "P",
      phone.signal,
    );

    phone.abort();
    registry.confirm();

    await expect(answer).resolves.toEqual({ kind: "expired" });
    expect(registry.state()).toEqual({ status: "expired" });
  });

  it("ignores a hang-up once the session is over", async () => {
    const registry = new PairingRegistry();
    const phone = new AbortController();
    const answer = registry.request(
      registry.start(NOW).token,
      "d",
      "P",
      phone.signal,
    );
    registry.confirm();
    await answer;

    phone.abort();

    expect(registry.state()).toEqual({ status: "paired", name: "P" });
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
