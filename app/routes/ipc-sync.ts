import { InflationUnavailableError } from "~/core/ports";
import { copyFor, parseLocale } from "~/lib";
import { runInflationSync } from "~/lib/ipc-sync.server";

import type { Route } from "./+types/ipc-sync";

export async function action({ request }: Route.ActionArgs) {
  try {
    const result = await runInflationSync();
    const added = result.outcomes.reduce(
      (sum, o) => sum + (o.status === "written" ? o.added : 0),
      0,
    );
    return Response.json({
      ok: true,
      added,
      written: result.written,
      rebaseBlocked: result.rebaseBlocked,
    } satisfies IpcSyncResponse);
  } catch (error) {
    if (error instanceof InflationUnavailableError) {
      console.error(
        "INE could not be reached",
        error.series,
        error.status,
        error.cause,
      );
      const t = copyFor(parseLocale(request.headers.get("Cookie")));
      return Response.json(
        { ok: false, error: t.basis.sync.unavailable } satisfies IpcSyncResponse,
        { status: 503 },
      );
    }
    console.error("IPC sync failed", error);
    return Response.json({ ok: false } satisfies IpcSyncResponse, {
      status: 500,
    });
  }
}

export type IpcSyncResponse =
  | {
      ok: true;
      added: number;
      written: number;
      rebaseBlocked: string[];
    }
  | { ok: false; error?: string };
