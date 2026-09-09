import type { ImportSummary } from "~/adapters/ingestion";
import type { PriceFillResult } from "~/lib/ingest";

import { es } from "~/lib";
import { SummaryList } from "./SummaryList";

export function DoneStep({
  summary,
  fill,
  unmapped,
}: {
  summary: ImportSummary;
  fill: PriceFillResult | null;
  unmapped: number;
}) {
  const copy = es.ingest.done;
  const discarded = Object.values(summary.discarded).reduce(
    (sum, count) => sum + count,
    0,
  );

  return (
    <>
      <p className="mb-3 text-[13px] font-medium">{copy.title}</p>

      <SummaryList summary={summary} />

      <ul className="mt-3 space-y-1 text-[12px] text-muted">
        <li>{copy.imported(summary.imported)}</li>
        {summary.duplicates > 0 && (
          <li>{copy.duplicates(summary.duplicates)}</li>
        )}
        {discarded > 0 && <li>{copy.discarded(discarded)}</li>}
        {fill && <li>{copy.candles(fill.candles)}</li>}
        {fill && <li>{copy.synced(fill.synced)}</li>}
        {fill && fill.stale > 0 && (
          <li className="text-negative">{copy.staleWarning(fill.stale)}</li>
        )}
        {unmapped > 0 && <li>{copy.unmapped(unmapped)}</li>}
        {unmapped > 0 && <li>{es.ingest.closeConfirm.hint}</li>}
      </ul>
    </>
  );
}
