import type { ImportSummary } from "~/adapters/ingestion";

import { es } from "~/lib";

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

  return (
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
  );
}
