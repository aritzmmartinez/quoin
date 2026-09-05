import { syncPrices } from "~/lib/prices-sync.server";

import type { Route } from "./+types/prices-sync";

export async function action(_: Route.ActionArgs) {
  try {
    const result = await syncPrices();
    return Response.json({
      ok: true,
      mapped: result.mapped,
      updated: result.updated,
      unmapped: result.unmapped.length,
      stale: result.failures.filter((f) => f.reason === "stale").length,
      noQuote: result.failures.filter((f) => f.reason === "no-quote").length,
    } satisfies PriceSyncResponse);
  } catch (error) {
    console.error("Price sync failed", error);
    return Response.json({ ok: false } satisfies PriceSyncResponse, {
      status: 500,
    });
  }
}

export type PriceSyncResponse =
  | {
      ok: true;
      mapped: number;
      updated: number;
      unmapped: number;
      stale: number;
      noQuote: number;
    }
  | { ok: false };
