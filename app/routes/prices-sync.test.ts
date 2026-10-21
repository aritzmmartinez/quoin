import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarketDataUnavailableError } from "~/core/ports";
import { syncInstrument } from "~/lib/prices-sync.server";

import type { Route } from "./+types/prices-sync";
import { action, type PriceSyncResponse } from "./prices-sync";

vi.mock("~/lib/prices-sync.server", () => ({ syncInstrument: vi.fn() }));

const sync = vi.mocked(syncInstrument);

function post(): Route.ActionArgs {
  return {
    request: new Request("http://localhost/api/prices/sync", {
      method: "POST",
      body: new URLSearchParams({ instrumentId: "IE00TEST0001" }),
    }),
  } as Route.ActionArgs;
}

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  sync.mockReset();
  logged.mockRestore();
});

describe("api/prices/sync", () => {
  it("answers a provider failure as unavailable, with no cause to stop on", async () => {
    sync.mockRejectedValue(new MarketDataUnavailableError("AAA.DE", 429));

    const response = await action(post());

    expect(response.status).toBe(503);
    expect((await response.json()) as PriceSyncResponse).toEqual({
      ok: false,
      problem: "unavailable",
    });
  });

  it("answers a failure common to every instrument with its cause, so the screen can stop once", async () => {
    sync.mockRejectedValue(
      new Error("The table `main.PriceSync` does not exist"),
    );

    const response = await action(post());

    expect(response.status).toBe(500);
    expect((await response.json()) as PriceSyncResponse).toEqual({
      ok: false,
      problem: "error",
      cause: "Error: The table `main.PriceSync` does not exist",
    });
  });
});
