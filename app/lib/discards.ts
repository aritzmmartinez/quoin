import type {
  DiscardCounts,
  DiscardDetail,
  DiscardDetails,
  NoticeDetails,
} from "~/adapters/ingestion/ingest";
import { BROKER_ROW_TYPES, type Broker } from "~/adapters/ingestion/detect";
import {
  AFFECTS_POSITION,
  DISCARD_REASONS,
  NOTICE_REASONS,
  type DiscardReason,
  type FileErrorReason,
  type NoticeReason,
  type RowRef,
  type RowTypeKey,
} from "~/adapters/ingestion/discard";

import type { Copy } from "./i18n";

export interface DiscardGroup {
  reason: DiscardReason;
  count: number;
  affectsPosition: boolean;
  details: readonly DiscardDetail[];
  byInstrument: readonly { instrument: string | null; count: number }[];
}

export function discardGroups(summary: {
  discarded: DiscardCounts;
  discardedDetails: DiscardDetails;
}): DiscardGroup[] {
  return DISCARD_REASONS.flatMap((reason) => {
    const count = summary.discarded[reason] ?? 0;
    if (count === 0) return [];
    const details = summary.discardedDetails[reason] ?? [];
    const tally = new Map<string | null, number>();
    for (const detail of details) {
      tally.set(detail.instrument, (tally.get(detail.instrument) ?? 0) + 1);
    }
    return [
      {
        reason,
        count,
        affectsPosition: affectsPosition(reason, count, details),
        details,
        byInstrument: [...tally]
          .map(([instrument, n]) => ({ instrument, count: n }))
          .sort(
            (a, b) =>
              b.count - a.count ||
              (a.instrument ?? "").localeCompare(b.instrument ?? ""),
          ),
      },
    ];
  });
}

function affectsPosition(
  reason: DiscardReason,
  count: number,
  details: readonly DiscardDetail[],
): boolean {
  const byReason = AFFECTS_POSITION[reason];
  return (
    (details.length < count && byReason) ||
    details.some((detail) => detail.affectsPosition ?? byReason)
  );
}

export interface NoticeGroup {
  reason: NoticeReason;
  details: readonly DiscardDetail[];
}

export function noticeGroups(summary: {
  noticed: NoticeDetails;
}): NoticeGroup[] {
  return NOTICE_REASONS.flatMap((reason) => {
    const details = summary.noticed[reason] ?? [];
    return details.length === 0 ? [] : [{ reason, details }];
  });
}

export function rowTypeLabel(
  t: Copy,
  broker: Broker | null,
  type: string,
): string {
  const own: Readonly<Record<string, RowTypeKey>> =
    broker === null ? {} : BROKER_ROW_TYPES[broker];
  const key = Object.hasOwn(own, type) ? own[type] : undefined;
  if (key !== undefined) return t.ingest.summary.rowTypes[key];
  const ledger: Readonly<Record<string, string>> = t.movements.types;
  return Object.hasOwn(ledger, type) ? (ledger[type] ?? type) : type;
}

export function describeRow(
  t: Copy,
  broker: Broker | null,
  row: RowRef,
): string {
  return [
    row.type === null ? null : rowTypeLabel(t, broker, row.type),
    row.date,
    row.externalId ??
      (row.position === null ? null : t.ingest.summary.rowNumber(row.position)),
  ]
    .filter((part) => part !== null && part !== "")
    .join(" · ");
}

export function fileErrorMessage(
  t: Copy,
  broker: Broker | null,
  error: {
    reason: FileErrorReason;
    column: string | null;
    row: RowRef | null;
  },
): string {
  switch (error.reason) {
    case "invalid-encoding":
      return t.ingest.invalidEncoding;
    case "unparseable":
      return t.ingest.unparseable;
    case "missing-column":
      return t.ingest.missingColumn(error.column ?? "");
    case "invalid-number":
    case "wrong-field-count":
      return t.ingest.rowRejected(
        error.row ? describeRow(t, broker, error.row) : "",
        t.ingest.summary.rowErrors[error.reason],
      );
  }
}
