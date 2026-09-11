import { ChevronDown } from "lucide-react";

import type { ImportSummary } from "~/adapters/ingestion";

import { es, formatDate } from "~/lib";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-row">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="text-[13px] tabular-nums">{value}</dd>
    </div>
  );
}

export function SummaryList({ summary }: { summary: ImportSummary }) {
  const copy = es.ingest.summary;
  const discarded = Object.entries(summary.discarded);
  const unsupported = summary.discardedDetails.unsupported ?? [];

  return (
    <>
      <dl className="divide-y divide-border">
        <Row label={copy.total} value={String(summary.total)} />
        <Row label={copy.imported} value={String(summary.imported)} />
        <Row label={copy.duplicates} value={String(summary.duplicates)} />
        <Row label={copy.instruments} value={String(summary.instruments)} />
        <Row
          label={copy.discarded}
          value={
            discarded.length === 0
              ? copy.none
              : discarded
                  .map(([reason, count]) => `${reason}: ${count}`)
                  .join(" · ")
          }
        />
        {summary.errors > 0 && (
          <Row label={copy.errors} value={String(summary.errors)} />
        )}
      </dl>

      {unsupported.length > 0 && (
        <details className="group mt-3 border-t border-border pt-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] text-muted marker:content-[''] [&::-webkit-details-marker]:hidden">
            <ChevronDown
              size={12}
              strokeWidth={1.75}
              aria-hidden
              className="shrink-0 transition-transform group-open:rotate-0 -rotate-90"
            />
            {copy.unsupportedDetails(unsupported.length)}
          </summary>
          <ul className="mt-2">
            {unsupported.map((row, i) => (
              <li
                key={i}
                className="flex justify-between gap-3 border-b border-border py-1.5 text-[12px] last:border-b-0"
              >
                <span className="min-w-0 truncate">
                  {row.instrument ?? copy.noInstrument} · {row.type}
                </span>
                <span className="shrink-0 tabular-nums text-muted">
                  {formatDate(row.date)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
