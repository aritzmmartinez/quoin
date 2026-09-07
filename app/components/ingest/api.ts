import type { IngestResponse } from "~/routes/ingest";

import { es } from "~/lib";

const ENDPOINT = "/api/ingest";

export async function postIngest(
  body: Record<string, string>,
): Promise<IngestResponse> {
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      body: new URLSearchParams(body),
    });
    return (await response.json()) as IngestResponse;
  } catch {
    return { ok: false, error: es.ingest.failed };
  }
}
