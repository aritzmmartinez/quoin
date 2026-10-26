import type {
  DiscardCounts,
  DiscardDetail,
  DiscardDetails,
  NoticeDetails,
} from "~/adapters/ingestion/ingest";
import {
  AFFECTS_POSITION,
  DISCARD_REASONS,
  NOTICE_REASONS,
  type DiscardReason,
  type NoticeReason,
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
        affectsPosition: AFFECTS_POSITION[reason],
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

export function discardTypeLabel(t: Copy, type: string): string {
  const types: Readonly<Record<string, string>> = t.movements.types;
  return Object.hasOwn(types, type) ? (types[type] ?? type) : type;
}
