import type { LucideIcon } from "lucide-react";
import { RefreshCw } from "lucide-react";

import { useCopy, useFormat } from "~/lib";
import type { SourceStatus } from "~/lib/external-data";

import { Button } from "../ui/Button";
import { SettingRow } from "./SettingRow";

export function ExternalDataSource({
  icon,
  label,
  hint,
  status,
  idle,
  refresh,
  busy,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  status: SourceStatus;
  idle?: string;
  refresh: () => void;
  busy: boolean;
}) {
  const t = useCopy();
  const { formatCalendarDate, formatPeriod, formatRelativeTime } = useFormat();
  const copy = t.settings.externalData;

  const until = status.until;
  const date =
    until === null
      ? null
      : until.kind === "period"
        ? formatPeriod(until.value)
        : formatCalendarDate(until.value);

  return (
    <SettingRow
      icon={icon}
      label={label}
      hint={hint}
      detail={
        <span className="flex flex-col gap-0.5 text-[11px] text-muted">
          {status.idle ? (
            <span>{idle}</span>
          ) : (
            <>
              <span>
                {status.lastChecked
                  ? copy.lastChecked(formatRelativeTime(status.lastChecked))
                  : copy.neverChecked}
              </span>
              <span>
                {date === null
                  ? copy.noData
                  : until?.name
                    ? copy.dataUntilFor(date, until.name)
                    : copy.dataUntil(date)}
              </span>
            </>
          )}
        </span>
      }
    >
      <Button size="sm" onClick={refresh} disabled={busy}>
        <RefreshCw
          size={13}
          strokeWidth={1.75}
          aria-hidden
          className={busy ? "animate-spin" : undefined}
        />
        {busy ? copy.refreshing : copy.refresh}
      </Button>
    </SettingRow>
  );
}
