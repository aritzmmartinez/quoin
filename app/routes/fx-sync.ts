import { runFxSync } from "~/lib/fx-sync.server";

import type { Route } from "./+types/fx-sync";

export async function action(_: Route.ActionArgs) {
  try {
    const result = await runFxSync();
    for (const outcome of result.outcomes) {
      if (outcome.status === "unavailable") {
        console.error("ECB could not be reached", outcome.quote, outcome.error);
      }
    }
    return Response.json({
      ok: true,
      currencies: result.outcomes.map((outcome) => outcome.quote),
      inserted: result.inserted,
      conflicted: result.conflicted,
      unavailable: result.unavailable,
    } satisfies FxSyncResponse);
  } catch (error) {
    console.error("FX sync failed", error);
    return Response.json({ ok: false } satisfies FxSyncResponse, {
      status: 500,
    });
  }
}

export type FxSyncResponse =
  | {
      ok: true;
      currencies: string[];
      inserted: number;
      conflicted: string[];
      unavailable: string[];
    }
  | { ok: false };
