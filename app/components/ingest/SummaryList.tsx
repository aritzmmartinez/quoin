import { ChevronDown } from "lucide-react";

import type {
  Broker,
  DiscardDetail,
  ImportSummary,
  RowError,
} from "~/adapters/ingestion";

import {
  type DiscardGroup as Group,
  type NoticeGroup as Notice,
  describeRow,
  discardGroups,
  rowTypeLabel,
  noticeGroups,
  useCopy,
  useFormat,
} from "~/lib";

function Row({
  label,
  help,
  value,
}: {
  label: string;
  help?: string;
  value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-row">
      <dt className="text-[12px] text-muted">
        {label}
        {help && <span className="block text-[11px] text-faint">{help}</span>}
      </dt>
      <dd className="text-right text-[13px] tabular-nums">{value}</dd>
    </div>
  );
}

function DiscardGroup({
  broker,
  group,
  pending,
}: {
  broker: Broker | null;
  group: Group;
  pending: boolean;
}) {
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
      <DetailList broker={broker} details={details} />
    </details>
  );
}

function DetailList({
  broker,
  details,
}: {
  broker: Broker | null;
  details: readonly DiscardDetail[];
}) {
  const { formatInstant } = useFormat();
  const t = useCopy();
  const copy = t.ingest.summary;

  return (
    <ul className="mt-2">
      {details.map((row, i) => (
        <li
          key={i}
          className="border-b border-border py-1.5 text-[12px] last:border-b-0"
        >
          <div className="flex justify-between gap-3">
            <span className="min-w-0 truncate">
              {row.instrument ?? copy.noInstrument} ·{" "}
              {rowTypeLabel(t, broker, row.type)}
              {row.subtype ? ` / ${row.subtype}` : ""}
            </span>
            <span className="shrink-0 tabular-nums text-muted">
              {formatInstant(row.date)}
            </span>
          </div>
          {row.rows?.map((other, j) => (
            <div
              key={j}
              className="mt-1 flex justify-between gap-3 pl-4 text-faint"
            >
              <span className="min-w-0 truncate">
                {copy.sameOperation}: {rowTypeLabel(t, broker, other.type)}
              </span>
              <span className="shrink-0 tabular-nums">
                {formatInstant(other.date)}
              </span>
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}

function NoticeGroupItem({
  broker,
  group,
}: {
  broker: Broker | null;
  group: Notice;
}) {
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
      <DetailList broker={broker} details={group.details} />
    </details>
  );
}

function ErrorList({
  broker,
  errors,
}: {
  broker: Broker | null;
  errors: readonly RowError[];
}) {
  const t = useCopy();
  const copy = t.ingest.summary;

  return (
    <details open className="group mt-3 border-t border-border pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] text-muted marker:content-[''] [&::-webkit-details-marker]:hidden">
        <ChevronDown
          size={12}
          strokeWidth={1.75}
          aria-hidden
          className="shrink-0 transition-transform group-open:rotate-0 -rotate-90"
        />
        <span className="font-medium text-negative">{copy.errors}</span>
        <span>· {copy.details(errors.length)}</span>
      </summary>
      <p className="mt-2 text-[12px] text-negative">{copy.errorsHelp}</p>
      <ul className="mt-2">
        {errors.map((error, i) => (
          <li
            key={i}
            className="border-b border-border py-1.5 text-[12px] last:border-b-0"
          >
            <div className="flex justify-between gap-3">
              <span className="min-w-0 truncate">
                {describeRow(t, broker, error)}
              </span>
              <span className="shrink-0 text-muted">
                {copy.rowErrors[error.reason]}
              </span>
            </div>
            {error.rows?.map((other, j) => (
              <div key={j} className="mt-1 truncate pl-4 text-faint">
                {copy.sameOperation}: {describeRow(t, broker, other)}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function SummaryList({
  broker,
  summary,
  pendingPrice = false,
}: {
  broker: Broker | null;
  summary: ImportSummary;
  pendingPrice?: boolean;
}) {
  const t = useCopy();
  const copy = t.ingest.summary;
  const discarded = discardGroups(summary);
  const notices = noticeGroups(summary);
  const isPending = (reason: Group["reason"]) =>
    pendingPrice &&
    (reason === "reward-unpriced" || reason === "swap-unpriced");

  return (
    <>
      <dl className="divide-y divide-border">
        <Row label={copy.total} value={String(summary.total)} />
        <Row label={copy.imported} value={String(summary.imported)} />
        {summary.completed > 0 && (
          <Row
            label={copy.completed}
            help={copy.completedHelp}
            value={String(summary.completed)}
          />
        )}
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
        {summary.failed > 0 && (
          <Row label={copy.errors} value={String(summary.failed)} />
        )}
      </dl>

      {discarded.map((group) =>
        group.details.length > 0 ? (
          <DiscardGroup
            key={group.reason}
            broker={broker}
            group={group}
            pending={isPending(group.reason)}
          />
        ) : null,
      )}
      {notices.map((group) => (
        <NoticeGroupItem key={group.reason} broker={broker} group={group} />
      ))}
      {summary.errors.length > 0 && (
        <ErrorList broker={broker} errors={summary.errors} />
      )}
    </>
  );
}
