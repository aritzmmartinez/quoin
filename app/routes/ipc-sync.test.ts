import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InflationUnavailableError } from "~/core/ports";
import { runInflationSync } from "~/lib/ipc-sync.server";

import type { Route } from "./+types/ipc-sync";
import { action, type IpcSyncResponse } from "./ipc-sync";

vi.mock("~/lib/ipc-sync.server", () => ({ runInflationSync: vi.fn() }));

const run = vi.mocked(runInflationSync);

function post(locale: "es" | "en"): Route.ActionArgs {
  return {
    request: new Request("http://localhost/api/ipc/sync", {
      method: "POST",
      headers: { Cookie: `quoin-locale=${locale}` },
    }),
  } as Route.ActionArgs;
}

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  run.mockReset();
  logged.mockRestore();
});

describe("api/ipc/sync", () => {
  it("answers 503 with a message in the reader's language when INE does not answer", async () => {
    const cause = new DOMException("No answer within 20 s", "TimeoutError");
    run.mockRejectedValue(new InflationUnavailableError("ES", null, { cause }));

    for (const [locale, message] of [
      ["es", "El INE no responde. Prueba más tarde."],
      ["en", "INE is not responding. Try again later."],
    ] as const) {
      const response = await action(post(locale));
      expect(response.status).toBe(503);
      expect((await response.json()) as IpcSyncResponse).toEqual({
        ok: false,
        error: message,
      });
    }
  });

  it("keeps the cause in the server log, not in the answer", async () => {
    const cause = new DOMException("No answer within 20 s", "TimeoutError");
    run.mockRejectedValue(new InflationUnavailableError("BI", 503, { cause }));

    const response = await action(post("en"));

    expect(JSON.stringify(await response.json())).not.toMatch(/TimeoutError/);
    expect(logged).toHaveBeenCalledWith(
      "INE could not be reached",
      "BI",
      503,
      cause,
    );
  });

  it("keeps a data error a generic 500", async () => {
    run.mockRejectedValue(
      new Error("INE returned no usable data for ES (IPC290751)"),
    );

    const response = await action(post("es"));

    expect(response.status).toBe(500);
    expect((await response.json()) as IpcSyncResponse).toEqual({ ok: false });
  });
});
