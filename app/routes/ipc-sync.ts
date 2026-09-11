import { runInflationSync } from "~/lib/ipc-sync.server";

import type { Route } from "./+types/ipc-sync";

export async function action(_: Route.ActionArgs) {
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
  | { ok: false };
