import { ChevronDown } from "lucide-react";

import type { DiscardDetail, ImportSummary } from "~/adapters/ingestion";

import {
  type DiscardGroup as Group,
  type NoticeGroup as Notice,
  discardGroups,
  discardTypeLabel,
  noticeGroups,
  useCopy,
  useFormat,
} from "~/lib";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-row">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="text-right text-[13px] tabular-nums">{value}</dd>
    </div>
  );
}

function DiscardGroup({ group, pending }: { group: Group; pending: boolean }) {
  const t = useCopy();
  const copy = t.ingest.summary;
  const { reason, details } = group;
  const warn = group.affectsPosition && !pending;
  const help = pending ? copy.pendingPriceNote : copy.reasonHelp[reason];

  return (
    <details open={warn} className="group mt-3 border-t border-border pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] text-muted marker:content-[''] [&::-webkit-details-marker]:hidden">
        <ChevronDown
          size={12}
          strokeWidth={1.75}
          aria-hidden
          className="shrink-0 transition-transform group-open:rotate-0 -rotate-90"
        />
        <span className={warn ? "font-medium text-negative" : undefined}>
          {pending ? copy.pendingPrice : copy.reasons[reason]}
        </span>
        <span>· {copy.details(details.length)}</span>
      </summary>
      {warn && (
        <p className="mt-2 text-[12px] text-negative">
          {help ?? copy.positionWarning}
        </p>
      )}
      {!warn && help && <p className="mt-1 text-[12px] text-body">{help}</p>}
      <DetailList details={details} />
    </details>
  );
}

function DetailList({ details }: { details: readonly DiscardDetail[] }) {
  const { formatDate } = useFormat();
  const t = useCopy();
  const copy = t.ingest.summary;

  return (
    <ul className="mt-2">
      {details.map((row, i) => (
        <li
          key={i}
          className="flex justify-between gap-3 border-b border-border py-1.5 text-[12px] last:border-b-0"
        >
          <span className="min-w-0 truncate">
            {row.instrument ?? copy.noInstrument} ·{" "}
            {discardTypeLabel(t, row.type)}
            {row.subtype ? ` / ${row.subtype}` : ""}
          </span>
          <span className="shrink-0 tabular-nums text-muted">
            {formatDate(row.date)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function NoticeGroupItem({ group }: { group: Notice }) {
  const copy = useCopy().ingest.summary;
  const warn = group.reason === "internal-booked-as-reward";

  return (
    <details open={warn} className="group mt-3 border-t border-border pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] text-muted marker:content-[''] [&::-webkit-details-marker]:hidden">
        <ChevronDown
          size={12}
          strokeWidth={1.75}
          aria-hidden
          className="shrink-0 transition-transform group-open:rotate-0 -rotate-90"
        />
        <span className={warn ? "font-medium text-negative" : undefined}>
          {copy.notices[group.reason]}
        </span>
        <span>· {copy.details(group.details.length)}</span>
      </summary>
      <p className={`mt-2 text-[12px] ${warn ? "text-negative" : "text-body"}`}>
        {copy.noticeHelp[group.reason]}
      </p>
      <DetailList details={group.details} />
    </details>
  );
}

export function SummaryList({
  summary,
  pendingRewards = false,
}: {
  summary: ImportSummary;
  pendingRewards?: boolean;
}) {
  const t = useCopy();
  const copy = t.ingest.summary;
  const discarded = discardGroups(summary);
  const notices = noticeGroups(summary);
  const isPending = (reason: Group["reason"]) =>
    pendingRewards && reason === "reward-unpriced";

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
                  .map(
                    ({ reason, count }) =>
                      `${isPending(reason) ? copy.pendingPrice : copy.reasons[reason]}: ${count}`,
                  )
                  .join(" · ")
          }
        />
        {notices.length > 0 && (
          <Row
            label={copy.noticed}
            value={notices
              .map(
                ({ reason, details }) =>
                  `${copy.notices[reason]}: ${details.length}`,
              )
              .join(" · ")}
          />
        )}
        {summary.errors > 0 && (
          <Row label={copy.errors} value={String(summary.errors)} />
        )}
      </dl>

      {discarded.map((group) =>
        group.details.length > 0 ? (
          <DiscardGroup
            key={group.reason}
            group={group}
            pending={isPending(group.reason)}
          />
        ) : null,
      )}
      {notices.map((group) => (
        <NoticeGroupItem key={group.reason} group={group} />
      ))}
    </>
  );
}
