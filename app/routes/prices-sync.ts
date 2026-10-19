import {
  syncProblemOf,
  type InstrumentSync,
  type SyncProblem,
} from "~/lib/prices-sync";
import { syncInstrument } from "~/lib/prices-sync.server";

import type { Route } from "./+types/prices-sync";

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData().catch(() => null);
  const instrumentId = form?.get("instrumentId");
  if (typeof instrumentId !== "string" || instrumentId === "") {
    return Response.json({ ok: false } satisfies PriceSyncResponse, {
      status: 400,
    });
  }
  try {
    const sync = await syncInstrument(instrumentId);
    if (!sync) {
      return Response.json({ ok: false } satisfies PriceSyncResponse, {
        status: 404,
      });
    }
    return Response.json({ ok: true, ...sync } satisfies PriceSyncResponse);
  } catch (error) {
    console.error("Price sync failed", instrumentId, error);
    const problem = syncProblemOf(error);
    return Response.json({ ok: false, problem } satisfies PriceSyncResponse, {
      status: problem === "unavailable" ? 503 : 500,
    });
  }
}

export type PriceSyncResponse =
  | ({ ok: true } & InstrumentSync)
  | { ok: false; problem?: SyncProblem };
