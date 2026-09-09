import { z } from "zod";

import type { Route } from "./+types/ingest";

import type { Broker, ImportSummary } from "~/adapters/ingestion";
import { isHistoryRange } from "~/lib/prices-backfill";
import {
  IngestError,
  checkQuoteSymbol,
  commitIngest,
  fillPrices,
  mapQuoteSymbol,
  previewIngest,
} from "~/lib/ingest.server";
import type { PendingMapping, PriceFillResult } from "~/lib/ingest";
import type { SymbolCheck } from "~/lib/symbol-check";

import { es } from "~/lib";

const csvForm = z.object({ csv: z.string().min(1) });
const symbolForm = z.object({
  instrumentId: z.string().min(1),
  symbol: z.string().trim().min(1),
});
const fillForm = z.object({
  instrumentIds: z.string(),
  range: z.string().refine(isHistoryRange),
});

export type IngestResponse =
  | { ok: true; step: "preview"; broker: Broker; summary: ImportSummary }
  | {
      ok: true;
      step: "commit";
      broker: Broker;
      summary: ImportSummary;
      pending: PendingMapping[];
    }
  | { ok: true; step: "check"; check: SymbolCheck }
  | { ok: true; step: "map"; instrumentId: string; removed: number }
  | ({ ok: true; step: "fill" } & PriceFillResult)
  | { ok: false; error: string };

function fail(error: string, status = 400): Response {
  return Response.json({ ok: false, error } satisfies IngestResponse, {
    status,
  });
}

export async function action({ request }: Route.ActionArgs) {
  const form = Object.fromEntries(await request.formData());

  try {
    switch (form.intent) {
      case "preview": {
        const parsed = csvForm.safeParse(form);
        if (!parsed.success) return fail(es.ingest.unreadable);
        const { broker, summary } = await previewIngest(parsed.data.csv);
        return Response.json({
          ok: true,
          step: "preview",
          broker,
          summary,
        } satisfies IngestResponse);
      }

      case "commit": {
        const parsed = csvForm.safeParse(form);
        if (!parsed.success) return fail(es.ingest.unreadable);
        const result = await commitIngest(parsed.data.csv);
        return Response.json({
          ok: true,
          step: "commit",
          ...result,
        } satisfies IngestResponse);
      }

      case "check": {
        const parsed = symbolForm.safeParse(form);
        if (!parsed.success) return fail(es.ingest.map.invalid);
        const check = await checkQuoteSymbol(
          parsed.data.instrumentId,
          parsed.data.symbol,
        );
        return Response.json({
          ok: true,
          step: "check",
          check,
        } satisfies IngestResponse);
      }

      case "map": {
        const parsed = symbolForm.safeParse(form);
        if (!parsed.success) return fail(es.ingest.map.invalid);
        const { removed } = await mapQuoteSymbol(
          parsed.data.instrumentId,
          parsed.data.symbol,
        );
        return Response.json({
          ok: true,
          step: "map",
          instrumentId: parsed.data.instrumentId,
          removed,
        } satisfies IngestResponse);
      }

      case "fill": {
        const parsed = fillForm.safeParse(form);
        if (!parsed.success) return fail(es.ingest.prices.invalid);
        const ids = parsed.data.instrumentIds
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id !== "");
        const result = await fillPrices(ids, parsed.data.range);
        return Response.json({
          ok: true,
          step: "fill",
          ...result,
        } satisfies IngestResponse);
      }

      default:
        return fail(es.ingest.unreadable);
    }
  } catch (error) {
    if (error instanceof IngestError) return fail(error.message);
    console.error("Ingest action failed", error);
    return fail(es.ingest.failed, 500);
  }
}
