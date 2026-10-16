import type { HistoryRange } from "~/core/ports";

import { HISTORY_RANGES, useCopy } from "~/lib";
import { Select } from "../ui/Select";

export function HistoryRangeSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: HistoryRange;
  onChange: (range: HistoryRange) => void;
  disabled?: boolean;
}) {
  const copy = useCopy().ingest.prices;

  return (
    <div>
      <span aria-hidden className="mb-1 block text-[11px] text-muted">
        {copy.range}
      </span>
      <Select
        label={copy.range}
        value={value}
        onChange={(next) => onChange(next as HistoryRange)}
        options={HISTORY_RANGES.map((option) => ({
          value: option,
          label: option,
        }))}
        disabled={disabled}
        className="w-40"
      />
    </div>
  );
}
