import { es, formatPercent, type Reading } from "~/lib";

import { Card } from "../ui/Card";

export function ReadingCard({
  reading,
  threshold,
}: {
  reading: Reading | null;
  threshold: string;
}) {
  const copy = es.allocation.reading;

  return (
    <Card className="p-6">
      <div className="mb-3.5 text-[11px] uppercase tracking-[0.08em] text-muted">
        {copy.title}
      </div>

      {reading === null ? (
        <p className="text-[13px] text-muted">{copy.empty}</p>
      ) : (
        <>
          <p className="m-0 text-[14px] leading-[1.65]">
            {copy.lead}
            <strong>{reading.name}</strong>
            {copy.isA}
            <strong>{formatPercent(reading.total, 1)}</strong>
            {Number(reading.direct) > 0 && Number(reading.via) > 0
              ? copy.breakdown(
                  formatPercent(reading.direct, 1, { floorNonZero: true }),
                  formatPercent(reading.via, 1, { floorNonZero: true }),
                )
              : Number(reading.via) > 0
                ? copy.allVia
                : copy.allDirect}
          </p>

          {reading.isOver && (
            <p className="mb-0 mt-3 text-[14px] leading-[1.65] text-negative">
              {copy.over(formatPercent(threshold, 0))}
            </p>
          )}

          {Number(reading.via) > 0 && (
            <p className="mb-0 mt-3 text-[13px] leading-[1.6] text-muted">
              {copy.viaNote}
            </p>
          )}

          <div className="my-5 h-px bg-border" />

          <dl className="flex flex-col gap-3">
            <Line label={copy.top3} value={formatPercent(reading.top3, 1)} />
            <Line label={copy.analysed} value={String(reading.leafCount)} />
            <Line label={copy.threshold} value={formatPercent(threshold, 0)} />
          </dl>
        </>
      )}
    </Card>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd className="m-0 font-medium tabular-nums">{value}</dd>
    </div>
  );
}
