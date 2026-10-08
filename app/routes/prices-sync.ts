import Decimal from "decimal.js";

import { PrismaLedgerRepository } from "~/adapters/persistence";
import { computePositions } from "~/core/projections";
import { splitUnmapped } from "~/lib/prices-sync";
import { syncPrices } from "~/lib/prices-sync.server";

import type { Route } from "./+types/prices-sync";

export async function action(_: Route.ActionArgs) {
  try {
    const [result, events] = await Promise.all([
      syncPrices(),
      new PrismaLedgerRepository().list(),
    ]);
    const openIds = new Set(
      computePositions(events)
        .filter((p) => new Decimal(p.quantity).gt(0))
        .map((p) => p.instrumentId),
    );
    const unmapped = splitUnmapped(result.unmapped, openIds);
    return Response.json({
      ok: true,
      mapped: result.mapped,
      updated: result.updated,
      unmappedOpen: unmapped.open,
      unmappedClosed: unmapped.closed,
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
      unmappedOpen: number;
      unmappedClosed: number;
      stale: number;
      noQuote: number;
    }
  | { ok: false };
