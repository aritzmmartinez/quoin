import type { IngestResponse } from "~/routes/ingest";

import type { Copy } from "~/lib";

const ENDPOINT = "/api/ingest";

let pending = 0;

export function ingestRequestPending(): boolean {
  return pending > 0;
}

export async function postIngest(
  t: Copy,
  body: Record<string, string>,
): Promise<IngestResponse> {
  pending += 1;
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      body: new URLSearchParams(body),
    });
    return (await response.json()) as IngestResponse;
  } catch {
    return { ok: false, error: t.ingest.failed };
  } finally {
    pending -= 1;
  }
}
